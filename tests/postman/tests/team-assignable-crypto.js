const { items } = pm.response.json();
const claimed = pm.collectionVariables.get('team_c_recruiter_id');
pm.test('only id, fullName, assigned and active, no contact data', () => {
  items.forEach((item) =>
    pm
      .expect(Object.keys(item).sort())
      .to.deep.equal(['active', 'assigned', 'fullName', 'id']),
  );
});
pm.test('the claiming Recruiter is listed as assigned', () => {
  const row = items.find((item) => item.id === claimed);
  pm.expect(row).to.be.an('object');
  pm.expect(row.assigned).to.equal(true);
  pm.expect(row.active).to.equal(true);
});
