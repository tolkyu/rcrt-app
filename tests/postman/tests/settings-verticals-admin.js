const { items } = pm.response.json();
pm.test('both demo verticals are listed', () => {
  pm.expect(items.length).to.be.at.least(2);
  pm.expect(items[0].name).to.have.length.above(0);
});
pm.collectionVariables.set('vertical_count', items.length);
pm.collectionVariables.set('vertical_id', items[0].id);
pm.collectionVariables.set('vertical_name', items[0].name);
pm.collectionVariables.set('vertical_version', items[0].version);
