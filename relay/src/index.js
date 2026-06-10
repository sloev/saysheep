import { startRelay } from './relay.js'
import config from '../relay.config.json' assert { type: 'json' }

const PORT = parseInt(process.env.PORT || config.port || '3001')
startRelay(PORT)
