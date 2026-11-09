const { items } = pm.response.json();
const byId = Object.fromEntries(items.map((p) => [p.id, p]));
const a = byId[pm.collectionVariables.get('position_a_id')];
const b = byId[pm.collectionVariables.get('position_b_id')];
const c = byId[pm.collectionVariables.get('position_c_id')];
pm.test('every throwaway position ends inactive in the manager view', () => {
  [a, b, c].forEach((p) => {
    pm.expect(p).to.be.an('object');
    pm.expect(p.isActive).to.equal(false);
    pm.expect(p.openVacanciesCount).to.equal(0);
  });
});
pm.test('refused writes left the Крипто position as created', () => {
  pm.expect(b.name).to.equal(pm.collectionVariables.get('position_b_name'));
});
