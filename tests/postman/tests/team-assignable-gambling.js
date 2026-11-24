const { items } = pm.response.json();
pm.test('only id, fullName, assigned and active, no contact data', () => {
  items.forEach((item) =>
    pm
      .expect(Object.keys(item).sort())
      .to.deep.equal(['active', 'assigned', 'fullName', 'id']),
  );
});
const candidates = items.filter((item) => !item.assigned);
pm.test('an unassigned entry is an active recruiter, never a Team Lead', () => {
  pm.expect(candidates.length).to.be.above(0);
  candidates.forEach((item) => pm.expect(item.active).to.equal(true));
  pm.expect(items.map((item) => item.id)).to.not.include(
    pm.collectionVariables.get('team_vasyl_id'),
  );
});
pm.collectionVariables.set('team_g_recruiter_id', candidates[0].id);
