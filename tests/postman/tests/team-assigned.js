const vacancy = pm.response.json();
pm.test('the recruiter joins the team, one version bump', () => {
  pm.expect(vacancy.recruiters.map((r) => r.id)).to.deep.equal([
    pm.collectionVariables.get('team_g_recruiter_id'),
  ]);
  pm.expect(vacancy.version).to.equal(
    Number(pm.collectionVariables.get('team_g_version')) + 1,
  );
  pm.expect(vacancy.canSelfAssign).to.equal(false);
});
pm.collectionVariables.set('team_g_version', vacancy.version);
