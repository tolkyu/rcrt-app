const { items } = pm.response.json();
const ids = items.map((p) => p.id);
pm.test('HR reads active positions of both verticals, without counts', () => {
  pm.expect(new Set(items.map((p) => p.verticalId)).size).to.equal(2);
  items.forEach((p) => {
    pm.expect(p.isActive).to.equal(true);
    pm.expect(p.openVacanciesCount).to.equal(null);
  });
  pm.expect(ids).to.include(pm.collectionVariables.get('position_a_id'));
  pm.expect(ids).to.include(pm.collectionVariables.get('position_b_id'));
});
