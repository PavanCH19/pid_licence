require('dotenv').config();
const { aws_remote_config, requestHandler } = require('./config');
const { 
  DynamoDBClient, 
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  ScanCommand
} = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

// Initialize DynamoDB client
const dynamoDbClient = new DynamoDBClient({
  region: aws_remote_config.region,
  credentials: aws_remote_config.accessKeyId && aws_remote_config.secretAccessKey ? {
    accessKeyId: aws_remote_config.accessKeyId,
    secretAccessKey: aws_remote_config.secretAccessKey
  } : undefined,
  requestHandler
});

async function createLicence_ddb(
    customer_name, 
    system_id, 
    site_name, 
    device_count, 
    generated_date, 
    validity, 
    activated_date, 
    email, 
    licence_state,
    password,
    description,
    file_url
  ) {
  
    const licenceEntry = {
      Customer_Names: customer_name,
      System_ID: system_id,
      SiteName: site_name,
      DeviceCount: device_count,
      GeneratedDate: generated_date,
      Validity: validity,
      ActivatedDate: activated_date,
      Email: email,
      LicenceState: licence_state,
      Password: password,
      Description: description,
      FileURL: file_url
    };
  
    const params = {
      TableName: 'PIDS_Customers',
      Item: marshall(licenceEntry),
      ConditionExpression: 'attribute_not_exists(Customer_Names) AND attribute_not_exists(System_ID)'
    };
  
    try {
      await dynamoDbClient.send(new PutItemCommand(params));
      
      return licenceEntry;
    } catch (error) {
      console.error('Error creating licence entry:', error);
      
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error('A licence with this Customer Name and System ID already exists');
      }
      
      throw error;
    }
}

async function updateLicence_ddb(customerName, systemId, updatedAttributes = {}) {
  const params = {
    TableName: 'PIDS_Customers',
    Key: marshall({
      Customer_Names: customerName, 
      System_ID: systemId,
    }),
    UpdateExpression: 'SET ',
    ExpressionAttributeValues: {},
    ReturnValues: 'ALL_NEW',
    // Ensure the item exists; otherwise the update must fail
    ConditionExpression: 'attribute_exists(Customer_Names) AND attribute_exists(System_ID)'
  };

  // Build the UpdateExpression and ExpressionAttributeValues
  const updateExpressionParts = [];
  Object.entries(updatedAttributes).forEach(([key, value]) => {
    updateExpressionParts.push(`#${key} = :${key}`);
    // Fix: Properly marshall individual values
    const marshalledValue = marshall({ [key]: value });
    params.ExpressionAttributeValues[`:${key}`] = marshalledValue[key];
  });
  
  // Add ExpressionAttributeNames for reserved words
  params.ExpressionAttributeNames = {};
  Object.keys(updatedAttributes).forEach(key => {
    params.ExpressionAttributeNames[`#${key}`] = key;
  });
  
  params.UpdateExpression += updateExpressionParts.join(', ');
  
  // Update the item
  try {
    const result = await dynamoDbClient.send(new UpdateItemCommand(params));
    return unmarshall(result.Attributes);
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      const notFoundError = new Error('License not found');
      notFoundError.code = 'NOT_FOUND';
      throw notFoundError;
    }
    throw error;
  }
}

async function deleteLicence_ddb(customerName, systemId) {
  const params = {
    TableName: 'PIDS_Customers',
    Key: marshall({
      'Customer_Names': customerName,
      'System_ID': systemId
    }),
    // Ensure item exists; otherwise, fail the delete
    ConditionExpression: 'attribute_exists(Customer_Names) AND attribute_exists(System_ID)',
    // Return old item to optionally verify deletion
    ReturnValues: 'ALL_OLD'
  };

  try{
    const result = await dynamoDbClient.send(new DeleteItemCommand(params));
    return result;
  }catch(err){
    if (err.name === 'ConditionalCheckFailedException') {
      const notFoundError = new Error('License not found');
      notFoundError.code = 'NOT_FOUND';
      throw notFoundError;
    }
    console.error("Error deleting an item:",err.message)
    throw err;
  }
}

async function getLicencesCount(cust_name) {
    const params = {
      TableName: "PIDS_Customers",
      KeyConditionExpression: `Customer_Names = :pkValue`,
      ExpressionAttributeValues: {
        ':pkValue': { S: cust_name }
      },
      Select: 'COUNT'
    };
  
    try {
      const result = await dynamoDbClient.send(new QueryCommand(params));
      return result.Count || 0;
    } catch (error) {
      console.error('Error counting rows in DynamoDB:', error);
      throw error;
    }
}

async function getLicencesByCustomer(cust_name) {
  const params = {
    TableName: "PIDS_Customers",
    KeyConditionExpression: `Customer_Names = :pkValue`,
    ExpressionAttributeValues: {
      ':pkValue': { S: cust_name }
    }
  };

  try {
    const result = await dynamoDbClient.send(new QueryCommand(params));
    return (result.Items || []).map(item => unmarshall(item));
  } catch (error) {
    console.error('Error querying licenses by customer:', error);
    throw error;
  }
}

async function getLicence_ddb(systemId) {
  const params = {
    TableName: "PIDS_Customers",
    IndexName: "System_ID-index",
    KeyConditionExpression: "System_ID = :systemId",
    ExpressionAttributeValues: {
      ":systemId": { S: systemId }
    }
  };

  try {
    const result = await dynamoDbClient.send(new QueryCommand(params));
    if (result.Items.length > 0) {
      console.log('Row fetched successfully:');
      return unmarshall(result.Items[0]);
    } else {
      console.log('No data found for the given System_ID.');
      return null;
    }
  } catch (error) {
    console.error('Error fetching row from DynamoDB:', error);
    throw error;
  }
}

async function getLicenceInfo_ddb() {
  const params = {
      TableName: 'PIDS_Customers', 
  };

  try {
      let items = [];
      let data;
      // Initialize counters
      let activeLicenses = 0;
      let inactiveLicenses = 0;
      let expiredLicenses = 0;
      let activatedLast30Days = 0;

      do {
          // Perform the scan operation
          data = await dynamoDbClient.send(new ScanCommand(params));

          // Collect items from this batch
          items = items.concat(data.Items);

          // Update the ExclusiveStartKey for the next batch
          params.ExclusiveStartKey = data.LastEvaluatedKey;
      } while (data.LastEvaluatedKey); // Continue if there are more items to fetch

      // Unmarshall all items
      const unmarshalledItems = items.map(item => unmarshall(item));

      const totalLicenses = unmarshalledItems.length;
      // Current date for comparison
      const currentDate = new Date();

      // Map for counting licenses per customer
      const customerLicenseCount = {};

      // Loop through the data to count and classify licenses
      unmarshalledItems.forEach((license) => {
          // Count active and inactive licenses
          if (license.LicenceState === 1) {
              activeLicenses++;
          } else if (license.LicenceState === 0) {
              inactiveLicenses++;
          }

          // Check for expired licenses
          if (license.ActivatedDate) {
              const activatedDate = new Date(license.ActivatedDate);
              const expiryDate = new Date(
                  activatedDate.getFullYear(),
                  activatedDate.getMonth() + license.Validity,
                  activatedDate.getDate()
              );

              if (expiryDate < currentDate) {
                  expiredLicenses++;
              }

              // Check if activated within the last 30 days
              const daysSinceActivation = (currentDate - activatedDate) / (1000 * 60 * 60 * 24);
              if (daysSinceActivation <= 30) {
              activatedLast30Days++;
              }
          }

          // Count licenses per customer
          if (license.Customer_Names) {
              customerLicenseCount[license.Customer_Names] = (customerLicenseCount[license.Customer_Names] || 0) + 1;
          }
      });

      // Get top 5 customers with the most licenses
      const top5Customers = Object.entries(customerLicenseCount)
        .sort((a, b) => b[1] - a[1]) // Sort by count (descending)
        .slice(0, 5) // Get top 5
        .map(([customer, count]) => ({ customer, count }));

      // Count unique customers (unique Customer_Names)
      const totalCustomers = Object.keys(customerLicenseCount).length;

      // Return results
      return {
        totalLicenses,
        activeLicenses,
        inactiveLicenses,
        expiredLicenses,
        activatedLast30Days,
        top5Customers,
        totalCustomers,
    };
  } catch (error) {
      console.error('Error scanning table:', error);
      throw error;
  }
}

async function getAllLicenses_ddb() {
  try{
    const params = {
      TableName: 'PIDS_Customers', 
    };
    const data = await dynamoDbClient.send(new ScanCommand(params));
    return data.Items.map(item => unmarshall(item));
  }catch(err){
    console.error(err);
    return null;
  }
}

async function activateLicense_ddb(customerName, systemId, FEmac, BEmac) {
  try {
      const params = {
          TableName: "PIDS_Customers",
          Key: marshall({
              Customer_Names: customerName, 
              System_ID: systemId,
          }),
          UpdateExpression:
              "SET LicenceState = :licenceState, ActivatedDate = :activatedDate, FEMac = :FEmac, BEMac = :BEmac",
          ExpressionAttributeValues: {
              ":licenceState": { N: "1" }, // Set LicenceState to 1
              ":activatedDate": { S: new Date().toISOString().split("T")[0] }, // Current date in YYYY-MM-DD format
              ":FEmac": { S: FEmac },
              ":BEmac": { S: BEmac }
          },
          ReturnValues: "ALL_NEW", // Return the updated item
      };

      // Execute the update operation
      const result = await dynamoDbClient.send(new UpdateItemCommand(params));

      console.log("License activated successfully:", result.Attributes);
      return unmarshall(result.Attributes);
  } catch (error) {
      console.error("Error activating license:", error);
      throw error;
  }
}

module.exports = {
    getLicencesCount,
    getLicencesByCustomer,
    getLicence_ddb,
    createLicence_ddb,
    updateLicence_ddb,
    deleteLicence_ddb,
    getLicenceInfo_ddb,
    getAllLicenses_ddb,
    activateLicense_ddb
};