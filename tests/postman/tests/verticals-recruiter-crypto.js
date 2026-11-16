const { items } = pm.response.json();
pm.test('only Крипто, not the Гемблінг vertical (VIS-01)', () => {
  const gambling = pm.collectionVariables.get('head_recruiter_vertical_id');
  pm.expect(gambling).to.be.a('string');
  pm.expect(items.map((v) => v.name)).to.deep.equal(['Крипто']);
  pm.expect(items[0].id).to.not.equal(gambling);
});
pm.collectionVariables.set('crypto_vertical_id', items[0].id);
