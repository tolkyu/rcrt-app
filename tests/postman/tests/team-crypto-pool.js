const vacancy = pm.response.json();
pm.test(
  'the removed Recruiter reads the vacancy again and may claim it',
  () => {
    pm.expect(vacancy.id).to.equal(pm.collectionVariables.get('team_c_id'));
    pm.expect(vacancy.recruiters).to.deep.equal([]);
    pm.expect(vacancy.canSelfAssign).to.equal(true);
  },
);
