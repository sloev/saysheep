import baseConfig from '../relay.config.json' with { type: 'json' }

const config = {
  ...baseConfig,
  port: process.env.PORT ? parseInt(process.env.PORT) : baseConfig.port,
  public_url: process.env.PUBLIC_URL || baseConfig.public_url,
  federation: {
    ...baseConfig.federation,
    peers: process.env.FEDERATION_PEERS ? process.env.FEDERATION_PEERS.split(',') : baseConfig.federation.peers,
    seeds: process.env.BOOTSTRAP_SEEDS ? process.env.BOOTSTRAP_SEEDS.split(',') : (baseConfig.federation.seeds || []),
    sync_interval_minutes: process.env.SYNC_INTERVAL_MINUTES ? parseInt(process.env.SYNC_INTERVAL_MINUTES) : baseConfig.federation.sync_interval_minutes
  }
}

export default config
