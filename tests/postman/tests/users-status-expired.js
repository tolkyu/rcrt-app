pm.test('only expired invites, the fixture among them', () => {
  const { items } = pm.response.json();
  items.forEach((u) => pm.expect(u.status).to.equal('INVITE_EXPIRED'));
  items.forEach((u) => pm.expect(u.inviteExpiresAt).to.be.a('string'));
  pm.expect(items.map((u) => u.id)).to.include(
    pm.collectionVariables.get('expired_id'),
  );
});
