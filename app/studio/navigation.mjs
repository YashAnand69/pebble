export function parseStudioRoute(search, knownExamples) {
  const params = new URLSearchParams(search);
  const requested = params.get('example');
  const example = knownExamples.includes(requested) ? requested : null;
  return {
    view: params.get('view') === 'studio' || example ? 'studio' : 'ecosystem',
    example,
  };
}
export function studioLocation(view, example, knownExamples) {
  const params = new URLSearchParams();
  params.set('view', view === 'studio' ? 'studio' : 'ecosystem');
  if (view === 'studio' && knownExamples.includes(example))
    params.set('example', example);
  return '?' + params.toString();
}

export function parseGuideRoute(search) {
  return new URLSearchParams(search).get('guide') === 'machine-learning'
    ? 'ml'
    : null;
}

const ecosystemTools = ['language', 'model', 'sentinel'];
export function parseEcosystemTool(search) {
  const tool = new URLSearchParams(search).get('tool');
  return ecosystemTools.includes(tool) ? tool : null;
}
export function ecosystemLocation(tool, workbench = false) {
  const params = new URLSearchParams({
    view: 'ecosystem',
    tool: ecosystemTools.includes(tool) ? tool : 'language',
  });
  return '?' + params.toString() + (workbench ? '#ecosystem-workbench' : '');
}
