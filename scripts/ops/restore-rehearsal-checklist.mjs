const checklist = [
  '1) Confirm incident scope and affected nursery IDs.',
  '2) Confirm latest completed tenant export exists.',
  '3) Restore export into staging namespace/database first.',
  '4) Validate child/user/class counts against production source.',
  '5) Validate spot-check records belong to target nursery only.',
  '6) Run npm run ops:integrity after staged restore.',
  '7) Collect sign-off from technical owner before production restore.',
  '8) Log evidence in PROGRESS.md with timestamp and owner.',
];

console.log('Restore rehearsal checklist');
for (const item of checklist) {
  console.log(item);
}
