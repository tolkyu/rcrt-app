const vacancy = pm.response.json();
pm.test('the Team Lead is set, one version bump, nothing more to set', () => {
  pm.expect(vacancy.teamLead.id).to.equal(
    pm.collectionVariables.get('team_tl_crypto_id'),
  );
  pm.expect(vacancy.version).to.equal(
    Number(pm.collectionVariables.get('team_c_version')) + 1,
  );
  pm.expect(vacancy.canSetTeamLead).to.equal(false);
});
pm.collectionVariables.set('team_c_version', vacancy.version);
