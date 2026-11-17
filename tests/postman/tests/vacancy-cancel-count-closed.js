pm.test('a cancelled draft leaves the draft count', () => {
  pm.expect(pm.response.json().count).to.equal(
    Number(pm.collectionVariables.get('vacancy_cancel_count')) - 1,
  );
});
