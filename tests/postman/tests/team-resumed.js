const vacancy = pm.response.json();
pm.test('open again, one version bump', () => {
  pm.expect(vacancy.status).to.equal('OPEN');
  pm.expect(vacancy.statusActions).to.have.members(['HOLD', 'CANCEL']);
  pm.expect(vacancy.version).to.equal(
    Number(pm.collectionVariables.get('team_g_version')) + 1,
  );
});
pm.collectionVariables.set('team_g_version', vacancy.version);
