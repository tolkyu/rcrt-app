const vacancy = pm.response.json();
pm.test('paused: only resume and cancel are left, one version bump', () => {
  pm.expect(vacancy.status).to.equal('ON_HOLD');
  pm.expect(vacancy.statusActions).to.have.members(['RESUME', 'CANCEL']);
  pm.expect(vacancy.version).to.equal(
    Number(pm.collectionVariables.get('team_g_version')) + 1,
  );
});
pm.test('the opening date stays (D85)', () => {
  pm.expect(vacancy.openedAt).to.be.a('string');
});
pm.collectionVariables.set('team_g_version', vacancy.version);
