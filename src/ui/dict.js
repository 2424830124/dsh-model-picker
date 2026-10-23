/**
 * The picker's two dictionaries.
 *
 * Kept as a plain object rather than the Client locale service because the
 * strings are this component's own copy, not a namespace other plugins
 * translate. Adding a language is one more entry here.
 */
export const DICT = {
  'zh-CN': {
    placeholder: '搜索模型',
    empty: '没有匹配的模型',
    loading: '正在读取模型列表…',
    failed: '读取模型列表失败',
    retry: '重试',
    noCatalog: '当前没有可用模型',
    trigger: (name) => `${name}（点此切换模型）`,
    effortTitle: (name) => `思考档位：${name}（点此调整）`,
    switching: '切换中…',
    switchFailed: '切换失败',
    providerDefault: '默认',
    groupFailed: (name) => `${name} 加载失败`
  },
  en: {
    placeholder: 'Search models',
    empty: 'No matching model',
    loading: 'Loading models…',
    failed: 'Could not load the model list',
    retry: 'Retry',
    noCatalog: 'No model is currently available',
    trigger: (name) => `${name} (click to switch model)`,
    effortTitle: (name) => `Reasoning level: ${name} (click to change)`,
    switching: 'Switching…',
    switchFailed: 'Switch failed',
    providerDefault: 'Default',
    groupFailed: (name) => `${name} failed to load`
  }
}

/**
 * Resolve a dictionary from a locale id.
 *
 * @param localeId - the active locale, e.g. `zh-CN` or `en-US`.
 * @returns the matching dictionary, English when the language is unknown.
 */
export function dictionaryFor(localeId) {
  return DICT[String(localeId ?? '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en']
}
