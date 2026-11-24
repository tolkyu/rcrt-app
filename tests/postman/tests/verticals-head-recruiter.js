const { items } = pm.response.json();
pm.test('only Гемблінг (VIS-01)', () => {
  pm.expect(items.map((v) => v.name)).to.deep.equal(['Гемблінг']);
});
pm.collectionVariables.set('head_recruiter_vertical_id', items[0].id);
