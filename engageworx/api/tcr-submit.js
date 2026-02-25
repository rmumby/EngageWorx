// /api/tcr-submit.js
// Submits brand and campaign registration to Twilio Trust Hub for 10DLC

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return res.status(500).json({ error: "Twilio credentials not configured" });
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const { action, formData, registrationId } = req.body;

  const twilioFetch = async (url, method, body) => {
    const response = await fetch(url, {
      method,
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body ? new URLSearchParams(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error_message || JSON.stringify(data));
    }
    return data;
  };

  try {
    if (action === "register_brand") {
      // Step 1: Create a Customer Profile (Trust Product)
      const trustProduct = await twilioFetch(
        `https://trusthub.twilio.com/v1/CustomerProfiles`,
        "POST",
        {
          FriendlyName: formData.legalName || "Brand Registration",
          Email: formData.contactEmail,
          PolicySid: "RNdfbf3fae0e1107f8aded0e7cead80bf5", // A2P 10DLC policy SID
        }
      );

      const customerProfileSid = trustProduct.sid;

      // Step 2: Create End User of type "customer_profile_business_information"
      const endUser = await twilioFetch(
        `https://trusthub.twilio.com/v1/EndUsers`,
        "POST",
        {
          FriendlyName: formData.legalName,
          Type: "customer_profile_business_information",
          "Attributes": JSON.stringify({
            business_name: formData.legalName,
            business_identity: formData.entityType === "sole_proprietor" ? "direct_customer" : "direct_customer",
            business_type: formData.entityType === "sole_proprietor" ? "Sole Proprietorship" :
              formData.entityType === "nonprofit" ? "Non-profit" :
              formData.entityType === "government" ? "Government" :
              formData.entityType === "public_profit" ? "Public" : "Partnership",
            business_industry: formData.vertical || "TECHNOLOGY",
            business_registration_identifier: "EIN",
            business_registration_number: formData.ein?.replace("-", "") || "",
            social_media_profile_urls: formData.website ? formData.website : "",
            website_url: formData.website || "",
            regions_of_operation: "US_AND_CANADA",
            stock_exchange: formData.entityType === "public_profit" ? "NYSE" : "NONE",
            stock_ticker: "",
          }),
        }
      );

      // Step 3: Attach End User to Customer Profile
      await twilioFetch(
        `https://trusthub.twilio.com/v1/CustomerProfiles/${customerProfileSid}/EntityAssignments`,
        "POST",
        { ObjectSid: endUser.sid }
      );

      // Step 4: Create Address (Supporting Document)
      const address = await twilioFetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Addresses.json`,
        "POST",
        {
          FriendlyName: formData.legalName + " Address",
          CustomerName: formData.legalName,
          Street: formData.street || "",
          City: formData.city || "",
          Region: formData.state || "",
          PostalCode: formData.zip || "",
          IsoCountry: formData.country || "US",
        }
      );

      // Step 5: Create Supporting Document for the address
      const supportDoc = await twilioFetch(
        `https://trusthub.twilio.com/v1/SupportingDocuments`,
        "POST",
        {
          FriendlyName: formData.legalName + " Address Proof",
          Type: "customer_profile_address",
          "Attributes": JSON.stringify({
            address_sids: address.sid,
          }),
        }
      );

      // Step 6: Attach Supporting Document to Customer Profile
      await twilioFetch(
        `https://trusthub.twilio.com/v1/CustomerProfiles/${customerProfileSid}/EntityAssignments`,
        "POST",
        { ObjectSid: supportDoc.sid }
      );

      // Step 7: Create Authorized Representative
      const authRep = await twilioFetch(
        `https://trusthub.twilio.com/v1/EndUsers`,
        "POST",
        {
          FriendlyName: `${formData.contactFirstName} ${formData.contactLastName}`,
          Type: "authorized_representative_1",
          "Attributes": JSON.stringify({
            first_name: formData.contactFirstName || "",
            last_name: formData.contactLastName || "",
            email: formData.contactEmail || "",
            phone_number: formData.contactPhone || "",
            business_title: formData.contactTitle || "Owner",
            job_position: formData.contactTitle || "Owner",
          }),
        }
      );

      // Step 8: Attach Auth Rep to Customer Profile
      await twilioFetch(
        `https://trusthub.twilio.com/v1/CustomerProfiles/${customerProfileSid}/EntityAssignments`,
        "POST",
        { ObjectSid: authRep.sid }
      );

      // Step 9: Evaluate Customer Profile
      const evaluation = await twilioFetch(
        `https://trusthub.twilio.com/v1/CustomerProfiles/${customerProfileSid}/Evaluations`,
        "POST",
        { PolicySid: "RNdfbf3fae0e1107f8aded0e7cead80bf5" }
      );

      // Step 10: Submit Customer Profile for review
      let profileStatus = "pending-review";
      try {
        const submitResult = await twilioFetch(
          `https://trusthub.twilio.com/v1/CustomerProfiles/${customerProfileSid}`,
          "POST",
          { Status: "pending-review" }
        );
        profileStatus = submitResult.status;
      } catch (submitErr) {
        // May fail if evaluation has issues — still return what we have
        profileStatus = "draft";
      }

      return res.status(200).json({
        success: true,
        action: "register_brand",
        customerProfileSid,
        endUserSid: endUser.sid,
        addressSid: address.sid,
        status: profileStatus,
        message: profileStatus === "pending-review"
          ? "Brand submitted for review! Typically takes 1-3 business days."
          : "Brand profile created. Review the evaluation results and resubmit.",
      });

    } else if (action === "register_campaign") {
      // A2P Campaign Registration via Messaging Service
      const { customerProfileSid, messagingServiceSid } = req.body;

      if (!messagingServiceSid) {
        // Create a Messaging Service if not provided
        const msgService = await twilioFetch(
          `https://messaging.twilio.com/v1/Services`,
          "POST",
          {
            FriendlyName: formData.legalName + " - A2P Campaign",
            UseInboundWebhookOnNumber: "false",
          }
        );

        // Assign the Twilio phone number to the messaging service
        const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
        if (phoneNumber) {
          // Get phone number SID
          const numbersRes = await twilioFetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`,
            "GET"
          );
          if (numbersRes.incoming_phone_numbers?.length > 0) {
            const numberSid = numbersRes.incoming_phone_numbers[0].sid;
            await twilioFetch(
              `https://messaging.twilio.com/v1/Services/${msgService.sid}/PhoneNumbers`,
              "POST",
              { PhoneNumberSid: numberSid }
            );
          }
        }

        // Create A2P Brand Registration
        const brandReg = await twilioFetch(
          `https://messaging.twilio.com/v1/a2p/BrandRegistrations`,
          "POST",
          {
            CustomerProfileBundleSid: customerProfileSid,
            A2PProfileBundleSid: customerProfileSid,
          }
        );

        // Map use case to TCR use case
        const useCaseMap = {
          marketing: "MARKETING",
          customer_care: "CUSTOMER_CARE",
          notifications: "DELIVERY_NOTIFICATION",
          two_factor: "TWO_FACTOR_AUTHENTICATION",
          mixed: "MIXED",
        };

        // Create Campaign
        const campaign = await twilioFetch(
          `https://messaging.twilio.com/v1/Services/${msgService.sid}/UsAppToPerson`,
          "POST",
          {
            BrandRegistrationSid: brandReg.sid,
            Description: formData.useCaseDescription || "Customer messaging campaign",
            MessageFlow: formData.optInDescription || "Customers opt in via website",
            MessageSamples: JSON.stringify([
              formData.sampleMessage1,
              formData.sampleMessage2,
              formData.sampleMessage3,
            ].filter(Boolean)),
            UsAppToPersonUsecase: useCaseMap[formData.useCase] || "MIXED",
            HasEmbeddedLinks: formData.hasEmbeddedLinks ? "true" : "false",
            HasEmbeddedPhone: formData.hasEmbeddedPhone ? "true" : "false",
            OptInMessage: formData.optInDescription || "You have opted in to receive messages.",
            OptOutMessage: "You have been unsubscribed. Reply START to resubscribe.",
            HelpMessage: "Reply STOP to unsubscribe. Reply HELP for support. Msg & data rates may apply.",
          }
        );

        return res.status(200).json({
          success: true,
          action: "register_campaign",
          messagingServiceSid: msgService.sid,
          brandRegistrationSid: brandReg.sid,
          campaignSid: campaign.sid,
          status: campaign.campaign_status || "pending",
          message: "Campaign submitted for TCR review!",
        });
      }

    } else if (action === "check_status") {
      const { customerProfileSid: cpSid } = req.body;

      if (cpSid) {
        const profile = await twilioFetch(
          `https://trusthub.twilio.com/v1/CustomerProfiles/${cpSid}`,
          "GET"
        );
        return res.status(200).json({
          success: true,
          status: profile.status,
          sid: profile.sid,
        });
      }

      return res.status(400).json({ error: "customerProfileSid required" });

    } else {
      return res.status(400).json({ error: "Invalid action. Use: register_brand, register_campaign, or check_status" });
    }

  } catch (error) {
    console.error("TCR submission error:", error);
    return res.status(500).json({
      error: error.message || "Registration failed",
      details: error.toString(),
    });
  }
}
