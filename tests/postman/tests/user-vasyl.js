const user = pm.response.json();
pm.test('Team Lead card with the Гемблінг priority row', () => {
  pm.expect(user.email).to.equal('vasyl.tl@demo');
  pm.expect(user.status).to.equal('ACTIVE');
  pm.expect(user.roles.map((r) => r.role)).to.deep.equal(['TEAM_LEAD']);
  pm.expect(user.teamLeadPriorities.map((p) => p.vertical.name)).to.deep.equal([
    'Гемблінг',
  ]);
  pm.expect(user.invitation).to.equal(null);
  pm.expect(user.mfaRequired).to.equal(false);
  pm.expect(user.lastActiveAdmin).to.equal(false);
});
pm.collectionVariables.set('vasyl_version', user.version);
