const user = pm.response.json();
pm.test('the only active Admin, 2FA mandatory', () => {
  pm.expect(user.email).to.equal('admin@demo');
  pm.expect(user.lastActiveAdmin).to.equal(true);
  pm.expect(user.mfaRequired).to.equal(true);
  pm.expect(user.teamLeadPriorities).to.have.lengthOf(0);
});
pm.collectionVariables.set('admin_version', user.version);
