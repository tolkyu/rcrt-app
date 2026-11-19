pm.test('same number of users as before', () => {
  pm.expect(pm.response.json().total).to.equal(
    Number(pm.collectionVariables.get('users_total')),
  );
});
