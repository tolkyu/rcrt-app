const vacancy = pm.response.json();
pm.test('the vacancy is back in the pool, one version bump', () => {
  pm.expect(vacancy.recruiters).to.deep.equal([]);
  pm.expect(vacancy.status).to.equal('OPEN');
  pm.expect(vacancy.version).to.equal(
    Number(pm.collectionVariables.get('team_c_version')) + 1,
  );
});
pm.collectionVariables.set('team_c_version', vacancy.version);
