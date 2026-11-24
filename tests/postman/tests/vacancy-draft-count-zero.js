pm.test('no authoring role, no drafts counted', () => {
  pm.expect(pm.response.json()).to.deep.equal({ count: 0 });
});
