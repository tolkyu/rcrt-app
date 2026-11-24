const vacancy = pm.response.json();
pm.test('an OPEN Гемблінг vacancy with Василь as its Team Lead', () => {
  pm.expect(vacancy.status).to.equal('OPEN');
  pm.expect(vacancy.vertical.name).to.equal('Гемблінг');
  pm.expect(vacancy.recruiters).to.deep.equal([]);
  pm.expect(vacancy.teamLead.id).to.equal(
    pm.collectionVariables.get('team_vasyl_id'),
  );
  pm.expect(vacancy.version).to.equal(1);
});
pm.collectionVariables.set('team_g_id', vacancy.id);
pm.collectionVariables.set('team_g_version', vacancy.version);
