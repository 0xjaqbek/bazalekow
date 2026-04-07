import 'dotenv/config';
import handler from '../api/drugs.js';

async function testCrud() {
  console.log('Testing Neon DB CRUD operations...');
  
  // Custom mock response to capture output
  const mockRes = () => {
    const res = {};
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.body = data;
      return res;
    };
    return res;
  };

  // 1. CLEAR existing test user data
  console.log('--> Cleaning test crew data');
  let res = mockRes();
  await handler({ method: 'DELETE', query: { crewId: 'TEST-CREW' } }, res);
  console.log(res.statusCode, res.body);

  // 2. CREATE
  console.log('--> Creating new drug');
  res = mockRes();
  await handler({
    method: 'POST',
    body: {
      id: 'test-uuid-123',
      crewId: 'TEST-CREW',
      substance: 'Adrenalina',
      productName: 'EpiTest',
      concentration: '1mg/ml',
      quantity: 10,
      source: 'manual'
    }
  }, res);
  console.log(res.statusCode, res.body);

  // 3. READ
  console.log('--> Reading drugs for TEST-CREW');
  res = mockRes();
  await handler({ method: 'GET', query: { crewId: 'TEST-CREW' } }, res);
  console.log(res.statusCode, res.body.length, 'items');
  if (res.body[0]) console.log('First item:', res.body[0].productName, 'Qty:', res.body[0].quantity);

  // 4. UPDATE
  console.log('--> Updating drug quantity');
  res = mockRes();
  await handler({
    method: 'PUT',
    body: { id: 'test-uuid-123', updates: { quantity: 15 } }
  }, res);
  console.log(res.statusCode, res.body);

  // 5. READ AGAIN
  res = mockRes();
  await handler({ method: 'GET', query: { crewId: 'TEST-CREW' } }, res);
  console.log('Updated Qty:', res.body[0] ? res.body[0].quantity : 'N/A');

  // 6. DELETE
  console.log('--> Deleting drug');
  res = mockRes();
  await handler({ method: 'DELETE', query: { id: 'test-uuid-123' } }, res);
  console.log(res.statusCode, res.body);

  console.log('Test completed successfully!');
}

testCrud().catch(console.error);
