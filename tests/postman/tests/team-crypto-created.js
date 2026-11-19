const vacancy = pm.response.json();
pm.test('an OPEN Крипто vacancy nobody works on yet, no Team Lead', () => {
  pm.expect(vacancy.status).to.equal('OPEN');
  pm.expect(vacancy.vertical.name).to.equal('Крипто');
  pm.expect(vacancy.recruiters).to.deep.equal([]);
  pm.expect(vacancy.teamLead).to.equal(null);
  pm.expect(vacancy.version).to.equal(1);
});
pm.test('Admin may manage the team and may not claim', () => {
  pm.expect(vacancy.canAssignRecruiters).to.equal(true);
  pm.expect(vacancy.canSetTeamLead).to.equal(true);
  pm.expect(vacancy.canSelfAssign).to.equal(false);
  pm.expect(vacancy.statusActions).to.have.members(['HOLD', 'CANCEL']);
});
pm.collectionVariables.set('team_c_id', vacancy.id);
pm.collectionVariables.set('team_c_version', vacancy.version);
