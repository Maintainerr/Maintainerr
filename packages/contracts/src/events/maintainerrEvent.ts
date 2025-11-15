export enum MaintainerrEvent {
  RuleHandler_Started = 'rule_handler.started',
  RuleHandler_Progressed = 'rule_handler.progressed',
  RuleHandler_Finished = 'rule_handler.finished',
  RuleHandler_Failed = 'rule_handler.failed',
  CollectionHandler_Started = 'collection_handler.started',
  CollectionHandler_Progressed = 'collection_handler.progressed',
  CollectionHandler_Finished = 'collection_handler.finished',
  CollectionHandler_Failed = 'collection_handler.failed',
  CollectionMedia_Added = 'collection_media.added',
  CollectionMedia_Removed = 'collection_media.removed',
  CollectionMedia_Handled = 'collection_media.handled',
  Notifications_Fire = 'agents.notify',
}
