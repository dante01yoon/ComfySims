const layer = (name, path, forbidden) => ({
  name,
  severity: 'error',
  from: { path },
  to: { path: forbidden }
})

module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'no-unresolvable', severity: 'error', from: {}, to: { couldNotResolve: true } },
    layer('packages-stay-pure', '^packages/', '^(web|mcp|harness|acceptance|demo)/'),
    layer('editor-not-agent-side', '^web/src/', '^(mcp|harness|acceptance|demo)/'),
    layer('mcp-not-editor-internals', '^mcp/', '^(web/src|harness|acceptance|demo)/'),
    layer('product-not-tests', '^(web|mcp|packages|harness)/', '^(acceptance|demo)/')
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|out|node_modules)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'], conditionNames: ['import', 'require', 'node', 'default'], exportsFields: ['exports'] }
  }
}
