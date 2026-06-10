import { startRelay } from './relay.js'
import config from '../relay.config.json' with { type: 'json' }

const PORT = parseInt(process.env.PORT || config.port || '3001')
startRelay(PORT)
