const { items } = pm.response.json();
const crypto = pm.collectionVariables.get('position_crypto_vertical_id');
pm.test('Recruiter picks active Крипто positions only, without counts', () => {
  pm.expect(items.length).to.be.above(0);
  items.forEach((p) => {
    pm.expect(p.verticalId).to.equal(crypto);
    pm.expect(p.isActive).to.equal(true);
    pm.expect(p.openVacanciesCount).to.equal(null);
  });
  pm.expect(items.map((p) => p.id)).to.include(
    pm.collectionVariables.get('position_b_id'),
  );
});
