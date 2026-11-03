const me = pm.response.json();
pm.test('own identity only', () => {
  pm.expect(me.user.email).to.equal('recruiter.crypto@demo');
  pm.expect(me.mfaRequired).to.equal(false);
});
pm.test('roles are vertical-scoped', () => {
  pm.expect(me.roles).to.have.length.above(0);
  me.roles.forEach((r) => pm.expect(r.vertical).to.not.equal(null));
});
pm.test('no leftover name from an aborted run', () => {
  pm.expect(me.user.fullName).to.have.length.above(0);
  pm.expect(me.user.fullName.endsWith(' API')).to.equal(false);
});
pm.collectionVariables.set('me_full_name', me.user.fullName);
