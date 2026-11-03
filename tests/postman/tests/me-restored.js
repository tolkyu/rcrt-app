pm.test('original name is back', () => {
  pm.expect(pm.response.json().user.fullName).to.equal(
    pm.collectionVariables.get('me_full_name'),
  );
});
