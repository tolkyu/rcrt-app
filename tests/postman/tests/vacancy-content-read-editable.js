const content = pm.response.json();
pm.test(
  'documents and effective edit eligibility share the current revision',
  () => {
    pm.expect(content.version).to.equal(
      Number(pm.collectionVariables.get('vacancy_content_version')),
    );
    pm.expect(content.status).to.equal('OPEN');
    pm.expect(content.canEditContent).to.equal(true);
    pm.expect(content.descriptionDoc.content[0].content[0].text).to.equal(
      'Content API replacement',
    );
    pm.expect(content.requirementsDoc).to.equal(null);
    pm.expect(pm.response.headers.get('Cache-Control')).to.equal(
      'private, no-store',
    );
  },
);
