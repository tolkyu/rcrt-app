const content = pm.response.json();
pm.test('the content read preserves NULL and the latest version', () => {
  pm.expect(content.version).to.equal(
    Number(pm.collectionVariables.get('vacancy_content_version')),
  );
  pm.expect(content.descriptionDoc).to.equal(null);
  pm.expect(content.requirementsDoc).to.equal(null);
  pm.expect(content.canEditContent).to.equal(true);
});
