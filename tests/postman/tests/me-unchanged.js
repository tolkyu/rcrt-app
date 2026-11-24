pm.test('normalised to the stored name, so nothing is written', () => {
  pm.expect(pm.response.json().user.fullName).to.equal(
    pm.collectionVariables.get('me_full_name'),
  );
});
