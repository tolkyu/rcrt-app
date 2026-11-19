const { count } = pm.response.json();
pm.test('the author counts the new draft', () => {
  pm.expect(count).to.be.at.least(1);
});
pm.collectionVariables.set('vacancy_cancel_count', String(count));
