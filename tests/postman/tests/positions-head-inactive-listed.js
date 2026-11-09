const { items } = pm.response.json();
const a = items.find(
  (p) => p.id === pm.collectionVariables.get('position_a_id'),
);
pm.test(
  'the manager list keeps the deactivated position with its count',
  () => {
    pm.expect(a).to.be.an('object');
    pm.expect(a.isActive).to.equal(false);
    pm.expect(a.openVacanciesCount).to.equal(0);
  },
);
