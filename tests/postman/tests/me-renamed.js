pm.test('name is normalised and saved', () => {
  const expected = `${pm.collectionVariables.get('me_full_name')} API`;
  pm.expect(pm.response.json().user.fullName).to.equal(expected);
});
