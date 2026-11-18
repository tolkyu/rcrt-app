const vacancy = pm.response.json();
pm.test('the team is empty again, one version bump', () => {
  pm.expect(vacancy.recruiters).to.deep.equal([]);
  pm.expect(vacancy.version).to.equal(
    Number(pm.collectionVariables.get('team_g_version')) + 1,
  );
});
pm.collectionVariables.set('team_g_version', vacancy.version);
