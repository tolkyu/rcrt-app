pm.test('one draft fewer than before the deletion', () => {
  pm.expect(pm.response.json().count).to.equal(
    Number(pm.collectionVariables.get('vacancy_draft_count')) - 1,
  );
});
