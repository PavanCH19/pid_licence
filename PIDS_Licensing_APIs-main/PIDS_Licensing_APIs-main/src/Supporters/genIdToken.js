const axios = require('axios');

const clientId = "65cao508q0rkt3ivt28cp1ng52";
const tokenEndpoint = "https://ap-south-1_Ih1P3o536.auth.ap-south-1.amazoncognito.com/oauth2/token";

async function renewIdToken(refreshToken) {
  try {
    // Prepare the request payload
    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("client_id", clientId);
    params.append("refresh_token", refreshToken);

    // Make the HTTP POST request to the Cognito token endpoint
    const response = await axios.post(tokenEndpoint, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    // Extract the ID token and other details from the response
    const { id_token, access_token, expires_in } = response.data;
    console.log("New ID Token:", id_token);
    console.log("New Access Token:", access_token);
    console.log("Token expires in (seconds):", expires_in);

    return id_token; // Return the new ID token
  } catch (error) {
    console.error("Error renewing ID Token:", error.response ? error.response.data : error.message);
    throw error;
  }
}

module.exports = {
    renewIdToken
}
