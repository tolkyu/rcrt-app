pm.test('back to the login page', () => {
  pm.expect(pm.response.json()).to.deep.equal({ redirectTo: '/login' });
});
