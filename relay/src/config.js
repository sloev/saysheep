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
  },
  moderation: {
    enabled: process.env.MODERATION_ENABLED ? process.env.MODERATION_ENABLED === 'true' : (baseConfig.moderation?.enabled ?? true),
    phash_threshold: process.env.MODERATION_PHASH_THRESHOLD ? parseInt(process.env.MODERATION_PHASH_THRESHOLD) : (baseConfig.moderation?.phash_threshold ?? 10),
    report_threshold: process.env.MODERATION_REPORT_THRESHOLD ? parseInt(process.env.MODERATION_REPORT_THRESHOLD) : (baseConfig.moderation?.report_threshold ?? 3),
    auto_block: process.env.MODERATION_AUTO_BLOCK ? process.env.MODERATION_AUTO_BLOCK === 'true' : (baseConfig.moderation?.auto_block ?? false),
    denylist_path: process.env.MODERATION_DENYLIST_PATH || (baseConfig.moderation?.denylist_path ?? 'denylist.csv')
  }
}

export default config
