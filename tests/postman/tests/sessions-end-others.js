pm.test('exactly one other session ended', () => {
  pm.expect(pm.response.json().count).to.equal(1);
});
