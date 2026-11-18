const vacancy = pm.response.json();
pm.test(
  'the Recruiter is the only recruiter and nothing is left to claim',
  () => {
    pm.expect(vacancy.recruiters).to.have.length(1);
    pm.expect(vacancy.recruiters[0].isActive).to.equal(true);
    pm.expect(vacancy.canSelfAssign).to.equal(false);
    pm.expect(vacancy.status).to.equal('OPEN');
  },
);
pm.test('one version bump per claim', () => {
  pm.expect(vacancy.version).to.equal(
    Number(pm.collectionVariables.get('team_c_version')) + 1,
  );
});
pm.collectionVariables.set('team_c_recruiter_id', vacancy.recruiters[0].id);
pm.collectionVariables.set('team_c_version', vacancy.version);
