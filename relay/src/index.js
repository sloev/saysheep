import { startRelay } from './relay.js'
import config from './config.js'

const PORT = parseInt(process.env.PORT || config.port || '3001')
startRelay(PORT)
