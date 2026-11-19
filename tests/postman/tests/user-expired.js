pm.test('pending invite past its expiry, never activated', () => {
  const user = pm.response.json();
  pm.expect(user.status).to.equal('INVITE_EXPIRED');
  pm.expect(user.activatedAt).to.equal(null);
  pm.expect(user.invitation.revokedAt).to.equal(null);
  pm.expect(Date.parse(user.invitation.expiresAt)).to.be.below(Date.now());
});
