const content = pm.response.json();
pm.test('null clears the description in one new revision', () => {
  pm.expect(content.version).to.equal(
    Number(pm.collectionVariables.get('vacancy_content_version')) + 1,
  );
  pm.expect(content.descriptionDoc).to.equal(null);
  pm.expect(content.requirementsDoc).to.equal(null);
});
pm.collectionVariables.set('vacancy_content_version', content.version);
