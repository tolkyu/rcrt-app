const content = pm.response.json();
pm.test(
  'closed documents remain readable without opening content editing',
  () => {
    pm.expect(content.version).to.equal(
      Number(pm.collectionVariables.get('team_g_version')),
    );
    pm.expect(content.status).to.equal('CANCELLED');
    pm.expect(content.canEditContent).to.equal(false);
    pm.expect(content.descriptionDoc).to.equal(null);
    pm.expect(content.requirementsDoc).to.equal(null);
  },
);
