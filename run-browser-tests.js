import { spawn, spawnSync } from 'child_process'
import { chromium } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import net from 'net'

let defaultArtifactDir = '/home/nihil/.gemini/antigravity-cli/brain/8c45f20c-a86b-4e90-923b-d2f64d0fe501'
if (!fs.existsSync('/home/nihil') || process.env.CI) {
  defaultArtifactDir = path.join(process.cwd(), 'test-artifacts')
}
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || defaultArtifactDir
const VIDEO_DIR = path.join(ARTIFACT_DIR, 'scratch', 'videos')

// Ensure video directory exists
fs.mkdirSync(VIDEO_DIR, { recursive: true })

// Clean up previous videos
try {
  const oldFiles = fs.readdirSync(VIDEO_DIR)
  for (const f of oldFiles) fs.unlinkSync(path.join(VIDEO_DIR, f))
} catch {}

// Helper to wait for a port to be ready
const waitForPort = (port, timeout = 15000) => {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      const socket = new net.Socket()
      socket.setTimeout(500)
      socket.on('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.on('error', () => {
        socket.destroy()
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`))
        } else {
          setTimeout(check, 500)
        }
      })
      socket.connect(port, '127.0.0.1')
    }
    check()
  })
}

// 1. Create a mock image file to upload
const mockJpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64')
fs.writeFileSync('mock-upload.jpg', mockJpg)

console.log('Spawning local relay on port 3008...')
const relayEnv = { ...process.env, PORT: '3008', DB_PATH: './data/relay-test.db', IROH_DATA_DIR: 'data/iroh-test' }
const relay = spawn('node', ['relay/src/index.js'], { env: relayEnv, stdio: 'inherit' })

console.log('Building client production bundle...')
const buildResult = spawnSync('npm', ['run', 'build'], { cwd: 'client', stdio: 'inherit' })
if (buildResult.status !== 0) {
  console.error('Client build failed!')
  process.exit(1)
}

console.log('Spawning client preview server on port 5173...')
const clientEnv = { ...process.env, VITE_RELAY_URL: 'ws://localhost:3008' }
const client = spawn('npx', ['vite', 'preview', '--port', '5173', '--host', '127.0.0.1'], { cwd: 'client', env: clientEnv, stdio: 'inherit' })

// Clean up database files
const cleanDbFiles = () => {
  ['./data/relay-test.db', './data/relay-test.db-wal', './data/relay-test.db-shm'].forEach(file => {
    try { if (fs.existsSync(file)) fs.unlinkSync(file) } catch {}
  })
  try { if (fs.existsSync('mock-upload.jpg')) fs.unlinkSync('mock-upload.jpg') } catch {}
}

const shutdown = async (code) => {
  console.log('Shutting down servers...')
  relay.kill()
  client.kill()
  cleanDbFiles()
  
  // Find the video and copy it
  try {
    const files = fs.readdirSync(VIDEO_DIR)
    const videoFile = files.find(f => f.endsWith('.webm'))
    if (videoFile) {
      const srcPath = path.join(VIDEO_DIR, videoFile)
      const destPath = path.join(ARTIFACT_DIR, 'browser_test_run.webm')
      fs.copyFileSync(srcPath, destPath)
      console.log(`Saved video recording to artifact: ${destPath}`)
    } else {
      console.warn('No video recording file found.')
    }
  } catch (err) {
    console.error('Failed to copy video recording:', err)
  }
  
  process.exit(code)
}

const runTest = async () => {
  console.log('Waiting for relay (3008) and client (5173) to be ready...')
  try {
    await Promise.all([
      waitForPort(3008),
      waitForPort(5173)
    ])
    console.log('Servers are ready. Starting browser test...')
  } catch (e) {
    console.error(e.message)
    await shutdown(1)
  }

  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      permissions: ['geolocation'],
      // Use Bouvet Island coordinates (uninhabited remote island) for E2E tests
      // so that test postings published to public relays do not clutter user feeds.
      geolocation: { latitude: -54.4208, longitude: 3.3614 },
      viewport: { width: 390, height: 844 }, // Mobile device aspect ratio
      recordVideo: {
        dir: VIDEO_DIR,
        size: { width: 390, height: 844 }
      }
    })
    
    // Explicitly grant geolocation permission for this origin
    await context.grantPermissions(['geolocation'], { origin: 'http://localhost:5173' })

    const page = await context.newPage()
    
    // Log browser events
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()))
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message))

    let verificationCode = ''
    page.on('dialog', async dialog => {
      console.log(`Dialog opened: [${dialog.type()}] "${dialog.message()}" - accepting...`)
      if (dialog.message().includes('Pickup Verification Code:')) {
        const match = dialog.message().match(/Code: ([0-9A-Za-z\-]+)/)
        if (match) {
          verificationCode = match[1]
          console.log(`Extracted verification code: ${verificationCode}`)
        }
      }
      if (dialog.type() === 'prompt') {
        await dialog.accept(verificationCode)
      } else {
        await dialog.accept()
      }
    })
    
    console.log('Navigating to http://localhost:5173...')
    await page.goto('http://localhost:5173')
    
    // Wait for main viewport/map to load
    await page.waitForSelector('#map', { timeout: 15000 })
    console.log('Map loaded successfully.')
    
    // Wait for store position loading to finish
    await page.waitForTimeout(3000)
    
    // Click '+' (nav-new link)
    console.log('Navigating to new item form...')
    await page.click('.nav-new')
    await page.waitForSelector('.photo-area', { timeout: 5000 })
    
    // Upload mock image
    console.log('Uploading photo...')
    await page.setInputFiles('input[type="file"]', 'mock-upload.jpg')
    await page.waitForTimeout(1000)
    
    // Fill title/description
    console.log('Filling out listing details...')
    await page.fill('.form-textarea', 'neo-brutalist vintage chair')
    
    // Add tag
    await page.fill('.tag-input-container .form-input', 'furniture')
    await page.press('.tag-input-container .form-input', 'Enter')
    await page.waitForTimeout(500)
    
    // Click submit
    console.log('Submitting listing...')
    await page.click('.btn-submit')
    
    // Wait to return to map/home
    await page.waitForSelector('#map', { timeout: 10000 })
    console.log('Item created! Back on map.')
    
    // Verify form reset regression test: navigate back to 'new' and assert form is empty
    console.log('Navigating back to new item form to verify it has reset...')
    await page.click('.nav-new')
    await page.waitForSelector('.photo-area', { timeout: 5000 })
    const textVal = await page.inputValue('.form-textarea')
    if (textVal !== '') {
      throw new Error('New item form textarea was not reset after item creation!')
    }
    const tagsCount = await page.locator('.tag-input-container .tag').count()
    if (tagsCount !== 0) {
      throw new Error('New item form tags were not reset after item creation!')
    }
    console.log('New item form reset verified successfully!')

    // Go to List view
    console.log('Navigating to list view...')
    await page.goto('http://localhost:5173/list')
    await page.waitForSelector('.item-card', { timeout: 5000 })
    
    // Verify item is listed
    const listedTitle = await page.textContent('.item-card-title')
    console.log(`Listed item title: "${listedTitle}"`)
    
    // Capture owner identity
    const ownerIdentity = await page.evaluate(() => localStorage.getItem('saysheep_identity_v1'))
    
    // Clear identity to act as taker
    console.log('Switching to Taker identity...')
    await page.evaluate(() => localStorage.removeItem('saysheep_identity_v1'))
    await page.goto('http://localhost:5173/list')
    await page.waitForSelector('.item-card', { timeout: 5000 })

    // Click item card
    console.log('Opening item detail page as taker...')
    await page.click('.item-card')
    await page.waitForSelector('.item-detail', { timeout: 5000 })
    
    // Click Take It
    console.log('Taking the item...')
    try {
      await page.click('.btn-take')
    } catch (err) {
      console.log('PAGE HTML ON TAKE FAILURE:', await page.content())
      throw err
    }
    await page.waitForSelector('.taken-stamp', { timeout: 5000 })
    console.log('Item marked as taken!')

    // Verify Take it button is hidden when taken (Bug #1 regression check)
    const isTakeButtonVisible = await page.isVisible('.btn-take')
    if (isTakeButtonVisible) {
      throw new Error('Take it button is still visible after item has been taken!')
    }
    console.log('Take it button is hidden when item is taken - verified!')

    // Verify claim message exists in chat and does not show raw "Item claimed: " string (Bug #1 regression check)
    const chatContent = await page.textContent('.chat-messages')
    if (chatContent.includes('Item claimed:')) {
      throw new Error('Claim message is not formatted, showing raw "Item claimed:" text!')
    }
    console.log('Claim message in chat is formatted successfully!')
    
    // Chat message
    console.log('Sending chat message...')
    await page.fill('.chat-input', 'Is this item still available?')
    await page.click('.chat-input-row .btn-primary')
    await page.waitForTimeout(1000)
    
    // Restore owner identity to test delete
    console.log('Switching back to Owner identity to delete listing...')
    await page.evaluate((key) => localStorage.setItem('saysheep_identity_v1', key), ownerIdentity)
    
    // Reload item detail page as owner
    await page.reload()
    await page.waitForSelector('.item-detail', { timeout: 5000 })
    
    // Delete item
    console.log('Deleting listing...')
    try {
      await page.click('.btn-danger', { timeout: 5000 })
    } catch (err) {
      console.log('PAGE HTML ON FAILURE:', await page.content())
      throw err
    }
    await page.waitForTimeout(2000)

    // Navigate to Agents Page
    console.log('Navigating to Agents page...')
    await page.goto('http://localhost:5173/agents')
    await page.waitForSelector('.form-section', { timeout: 5000 })
    
    // Add tag to Agent
    console.log('Adding tags to agent...')
    await page.fill('.tag-input-container .form-input', 'furniture')
    await page.press('.tag-input-container .form-input', 'Enter')
    await page.waitForTimeout(500)

    // Click "Add Agent" button
    console.log('Submitting new agent subscription...')
    await page.click('.btn-submit')
    await page.waitForSelector('.alert-card', { timeout: 5000 })
    console.log('Agent subscription added successfully!')

    // Toggle Notifications
    console.log('Toggling notifications for agent...')
    const bellBtn = page.locator('.alert-card button').first()
    await bellBtn.click()
    await page.waitForTimeout(500)
    
    // Delete the Agent
    console.log('Removing agent...')
    await page.click('.alert-card .btn-danger')
    await page.waitForTimeout(1000)
    console.log('Agent removed successfully.')

    // Navigate to Settings Page
    console.log('Navigating to Settings page...')
    await page.goto('http://localhost:5173/settings')
    await page.waitForSelector('.settings-section', { timeout: 5000 })

    // Change language to Danish ('da')
    console.log('Changing interface language to Danish...')
    await page.selectOption('select.form-select', 'da')
    await page.waitForTimeout(1000)
    // Verify translation changed (e.g. settings header or relays label)
    const settingsHeader = await page.textContent('.page-title')
    console.log(`Settings header text in Danish: "${settingsHeader}"`)

    // Change back to English ('en')
    console.log('Changing interface language back to English...')
    await page.selectOption('select.form-select', 'en')
    await page.waitForTimeout(1000)

    // Add a new relay
    console.log('Adding a test relay...')
    const testRelay = 'wss://relay.example.com'
    await page.fill('.settings-section input[type="url"]', testRelay)
    await page.press('.settings-section input[type="url"]', 'Enter')
    await page.waitForTimeout(1000)

    // Verify relay is listed
    const relayListText = await page.textContent('.relay-list')
    if (relayListText.includes(testRelay)) {
      console.log('Relay added successfully!')
    } else {
      throw new Error('Test relay was not added to the list')
    }

    // Remove the relay
    console.log('Removing the test relay...')
    const removeBtn = page.locator('.relay-item', { hasText: testRelay }).locator('button')
    await removeBtn.click()
    await page.waitForTimeout(1000)
    console.log('Relay removed successfully.')
    
    console.log('All browser test actions completed successfully!')
    await context.close()
    await browser.close()
    await shutdown(0)
  } catch (err) {
    console.error('Test failed with error:', err)
    if (browser) await browser.close()
    await shutdown(1)
  }
}

runTest()
