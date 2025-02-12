/*
Copyright 2015-2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import Button from "@atlaskit/button";
import { HelperMessage } from "@atlaskit/form";
import SectionMessage from "@atlaskit/section-message";
import classNames from "classnames";
import { createClient, MatrixClient } from "matrix-js-sdk";
import React, { ReactNode } from "react";
import { Logo } from "../../main/components/Logo";
import { getStoredSessionOwner } from "../AuthStoreUtil";
import { MatrixClientPeg } from "../MatrixClientPeg";
import AuthStyles from "./AuthStyles.module.css";
import Spinner from "./elements/Spinner";
import SSOButtons from "./elements/SSOButtons";
import InteractiveAuth from "./InteractiveAuth";
import Login, { ISSOFlow } from "./LoginHelper";
import AutoDiscoveryUtils, {
  ValidatedServerConfig,
} from "./util/AutoDiscoveryUtils";
import { messageForResourceLimitError } from "./util/messages";
import RegistrationForm from "./views/RegistrationForm";

interface IProps {
  serverConfig: ValidatedServerConfig;
  defaultDeviceDisplayName: string;
  email?: string;
  brand?: string;
  clientSecret?: string;
  sessionId?: string;
  idSid?: string;
  pageAfterLogin?: string;

  // Called when the user has logged in. Params:
  // - object with userId, deviceId, homeserverUrl, identityServerUrl, accessToken
  // - The user's password, if available and applicable (may be cached in memory
  //   for a short time so the user is not required to re-enter their password
  //   for operations like uploading cross-signing keys).
  onLoggedIn(
    params: {
      userId: string;
      deviceId: string;
      homeserverUrl: string;
      identityServerUrl: string;
      accessToken: string;
    },
    password: string
  ): void;
  makeRegistrationUrl(params: {
    /* eslint-disable camelcase */
    client_secret: string;
    hs_url: string;
    is_url?: string;
    session_id: string;
    /* eslint-enable camelcase */
  }): string;
  // registration shouldn't know or care how login is done.
  onLoginClick(): void;
  onServerConfigChange(config: ValidatedServerConfig): void;
}

interface IState {
  busy: boolean;
  errorText?: string;
  // true if we're waiting for the user to complete
  // We remember the values entered by the user because
  // the registration form will be unmounted during the
  // course of registration, but if there's an error we
  // want to bring back the registration form with the
  // values the user entered still in it. We can keep
  // them in this component's state since this component
  // persist for the duration of the registration process.
  formVals: Record<string, string>;
  // user-interactive auth
  // If we've been given a session ID, we're resuming
  // straight back into UI auth
  doingUIAuth: boolean;
  // If set, we've registered but are not going to log
  // the user in to their new account automatically.
  completedNoSignin: boolean;
  flows?: {
    stages: string[];
  }[];
  // We perform liveliness checks later, but for now suppress the errors.
  // We also track the server dead errors independently of the regular errors so
  // that we can render it differently, and override any other error the user may
  // be seeing.
  serverIsAlive: boolean;
  serverErrorIsFatal: boolean;
  serverDeadError?: ReactNode;

  // Our matrix client - part of state because we can't render the UI auth
  // component without it.
  matrixClient?: MatrixClient;
  // The user ID we've just registered
  registeredUsername?: string;
  // if a different user ID to the one we just registered is logged in,
  // this is the user ID that's logged in.
  differentLoggedInUserId?: string;
  // the SSO flow definition, this is fetched from /login as that's the only
  // place it is exposed.
  ssoFlow?: ISSOFlow;
}

export default class Registration extends React.Component<IProps, IState> {
  loginLogic: Login;

  constructor(props: IProps) {
    super(props);

    this.state = {
      busy: false,
      errorText: undefined,
      formVals: this.props.email
        ? {
            email: this.props.email,
          }
        : {},
      doingUIAuth: Boolean(this.props.sessionId),
      flows: undefined,
      completedNoSignin: false,
      serverIsAlive: true,
      serverErrorIsFatal: false,
      serverDeadError: "",
    };

    const { hsUrl, isUrl } = this.props.serverConfig;
    this.loginLogic = new Login(hsUrl, isUrl, undefined, {
      defaultDeviceDisplayName: "Element login check", // We shouldn't ever be used
    });
  }

  componentDidMount() {
    this.replaceClient(this.props.serverConfig);
  }

  // TODO: [REACT-WARNING] Replace with appropriate lifecycle event
  // eslint-disable-next-line camelcase
  UNSAFE_componentWillReceiveProps(newProps: IProps) {
    if (
      newProps.serverConfig.hsUrl === this.props.serverConfig.hsUrl &&
      newProps.serverConfig.isUrl === this.props.serverConfig.isUrl
    )
      return;

    this.replaceClient(newProps.serverConfig);
  }

  private async replaceClient(serverConfig: ValidatedServerConfig) {
    this.setState({
      errorText: undefined,
      serverDeadError: null,
      serverErrorIsFatal: false,
      // busy while we do liveness check (we need to avoid trying to render
      // the UI auth component while we don't have a matrix client)
      busy: true,
    });

    // Do a liveliness check on the URLs
    try {
      await AutoDiscoveryUtils.validateServerConfigWithStaticUrls(
        serverConfig.hsUrl,
        serverConfig.isUrl
      );
      this.setState({
        serverIsAlive: true,
        serverErrorIsFatal: false,
      });
    } catch (e: any) {
      this.setState({
        busy: false,
        ...AutoDiscoveryUtils.authComponentStateForError(e, "register"),
      });
      if (this.state.serverErrorIsFatal) {
        return; // Server is dead - do not continue.
      }
    }

    const { hsUrl, isUrl } = serverConfig;
    const cli = createClient({
      baseUrl: hsUrl,
      idBaseUrl: isUrl,
    });

    this.loginLogic.setHomeserverUrl(hsUrl);
    this.loginLogic.setIdentityServerUrl(isUrl);

    let ssoFlow: ISSOFlow | undefined;
    try {
      const loginFlows = await this.loginLogic.getFlows();
      ssoFlow = loginFlows.find(
        (f) => f.type === "m.login.sso" || f.type === "m.login.cas"
      ) as ISSOFlow;
    } catch (e) {
      console.error("Failed to get login flows to check for SSO support", e);
    }

    this.setState({
      matrixClient: cli,
      ssoFlow,
      busy: false,
    });
    const showGenericError = (e: any) => {
      this.setState({
        errorText: "Unable to query for supported registration methods.",
        // add empty flows array to get rid of spinner
        flows: [],
      });
    };
    try {
      // We do the first registration request ourselves to discover whether we need to
      // do SSO instead. If we've already started the UI Auth process though, we don't
      // need to.
      if (!this.state.doingUIAuth) {
        await this.makeRegisterRequest(cli, null);
        // This should never succeed since we specified no auth object.
        console.log("Expecting 401 from register request but got success!");
      }
    } catch (e: any) {
      if (e.httpStatus === 401) {
        this.setState({
          flows: e.data.flows,
        });
      } else if (e.httpStatus === 403 && e.errcode === "M_UNKNOWN") {
        // At this point registration is pretty much disabled, but before we do that let's
        // quickly check to see if the server supports SSO instead. If it does, we'll send
        // the user off to the login page to figure their account out.
        if (ssoFlow) {
          // Redirect to login page - server probably expects SSO only
          //   dis.dispatch({ action: "start_login" });
          // TODO SSO
        } else {
          this.setState({
            serverErrorIsFatal: true, // fatal because user cannot continue on this server
            errorText: "Registration has been disabled on this homeserver.",
            // add empty flows array to get rid of spinner
            flows: [],
          });
        }
      } else {
        console.log("Unable to query for supported registration methods.", e);
        showGenericError(e);
      }
    }
  }

  private onFormSubmit = async (formVals: {
    username: string;
    password: string;
    email?: string;
    phoneCountry?: string;
    phoneNumber?: string;
  }) => {
    this.setState({
      errorText: "",
      busy: true,
      formVals: formVals,
      doingUIAuth: true,
    });
  };

  private requestEmailToken = (
    emailAddress: string,
    clientSecret: string,
    sendAttempt: any,
    sessionId: any
  ) => {
    return this.state.matrixClient!.requestRegisterEmailToken(
      emailAddress,
      clientSecret,
      sendAttempt,
      this.props.makeRegistrationUrl({
        client_secret: clientSecret,
        hs_url: this.state.matrixClient!.getHomeserverUrl(),
        is_url: this.state.matrixClient!.getIdentityServerUrl(),
        session_id: sessionId,
      })
    );
  };

  private onUIAuthFinished = async (
    success: boolean,
    response: any,
    extra: any
  ) => {
    if (!success) {
      let msg = response.message || response.toString();
      // can we give a better error message?
      if (response.errcode === "M_RESOURCE_LIMIT_EXCEEDED") {
        const errorTop = messageForResourceLimitError(
          response.data.limit_type,
          {
            monthly_active_user:
              "This homeserver has hit its Monthly Active User limit.",
            hs_blocked:
              "This homeserver has been blocked by it's administrator.",
            "": "This homeserver has exceeded one of its resource limits.",
          }
        );
        const errorDetail = messageForResourceLimitError(
          response.data.limit_type,
          {
            "": "Please contact your service administrator to continue using this service.",
          }
        );
        msg = (
          <div>
            <p>{errorTop}</p>
            <p>{errorDetail}</p>
          </div>
        );
      } else if (
        response.required_stages &&
        response.required_stages.indexOf("m.login.msisdn") > -1
      ) {
        let msisdnAvailable = false;
        for (const flow of response.available_flows) {
          msisdnAvailable =
            msisdnAvailable || flow.stages.includes("m.login.msisdn");
        }
        if (!msisdnAvailable) {
          msg =
            "This server does not support authentication with a phone number.";
        }
      } else if (response.errcode === "M_USER_IN_USE") {
        msg = "That username already exists, please try another.";
      }
      this.setState({
        busy: false,
        doingUIAuth: false,
        errorText: msg,
      });
      return;
    }

    MatrixClientPeg.setJustRegisteredUserId(response.user_id);

    const newState = {
      doingUIAuth: false,
      registeredUsername: response.user_id,
      differentLoggedInUserId: undefined as string | undefined,
      completedNoSignin: false,
      // we're still busy until we get unmounted: don't show the registration form again
      busy: true,
    };

    // The user came in through an email validation link. To avoid overwriting
    // their session, check to make sure the session isn't someone else, and
    // isn't a guest user since we'll usually have set a guest user session before
    // starting the registration process. This isn't perfect since it's possible
    // the user had a separate guest session they didn't actually mean to replace.
    const [sessionOwner, sessionIsGuest] = (await getStoredSessionOwner()) || [
      undefined,
      undefined,
    ];
    if (sessionOwner && !sessionIsGuest && sessionOwner !== response.userId) {
      console.log(
        `Found a session for ${sessionOwner} but ${response.userId} has just registered.`
      );
      newState.differentLoggedInUserId = sessionOwner;
    }

    if (response.access_token) {
      await this.props.onLoggedIn(
        {
          userId: response.user_id,
          deviceId: response.device_id,
          homeserverUrl: this.state.matrixClient!.getHomeserverUrl(),
          identityServerUrl: this.state.matrixClient!.getIdentityServerUrl(),
          accessToken: response.access_token,
        },
        this.state.formVals.password
      );

      this.setupPushers();
    } else {
      newState.busy = false;
      newState.completedNoSignin = true;
    }

    this.setState(newState);
  };

  private setupPushers() {
    if (!this.props.brand) {
      return Promise.resolve();
    }
    const matrixClient = MatrixClientPeg.get();
    return matrixClient.getPushers().then(
      (resp: any) => {
        const pushers = resp.pushers;
        for (let i = 0; i < pushers.length; ++i) {
          if (pushers[i].kind === "email") {
            const emailPusher = pushers[i];
            emailPusher.data = { brand: this.props.brand };
            matrixClient.setPusher(emailPusher).then(
              () => {
                console.log("Set email branding to " + this.props.brand);
              },
              (error: any) => {
                console.error("Couldn't set email branding: " + error);
              }
            );
          }
        }
      },
      (error: any) => {
        console.error("Couldn't get pushers: " + error);
      }
    );
  }

  private onLoginClick = (ev: React.MouseEvent<HTMLElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    this.props.onLoginClick();
  };

  private onGoToFormClicked = (ev: React.MouseEvent<HTMLAnchorElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    this.replaceClient(this.props.serverConfig);
    this.setState({
      busy: false,
      doingUIAuth: false,
    });
  };

  private makeRegisterRequest = (matrixClient: MatrixClient, auth: any) => {
    // We inhibit login if we're trying to register with an email address: this
    // avoids a lot of complex race conditions that can occur if we try to log
    // the user in one one or both of the tabs they might end up with after
    // clicking the email link.
    let inhibitLogin: boolean | undefined = Boolean(this.state.formVals.email);

    // Only send inhibitLogin if we're sending username / pw params
    // (Since we need to send no params at all to use the ones saved in the
    // session).
    if (!this.state.formVals.password) inhibitLogin = undefined;

    const registerParams = {
      username: this.state.formVals.username,
      password: this.state.formVals.password,
      initial_device_display_name: this.props.defaultDeviceDisplayName,
      auth: undefined,
      inhibit_login: undefined as boolean | undefined,
    };
    if (auth) registerParams.auth = auth;
    if (inhibitLogin !== undefined && inhibitLogin !== null)
      registerParams.inhibit_login = inhibitLogin;
    return matrixClient.registerRequest(registerParams);
  };

  private getUIAuthInputs() {
    return {
      emailAddress: this.state.formVals.email,
      phoneCountry: this.state.formVals.phoneCountry,
      phoneNumber: this.state.formVals.phoneNumber,
    };
  }

  // Links to the login page shown after registration is completed are routed through this
  // which checks the user hasn't already logged in somewhere else (perhaps we should do
  // this more generally?)
  // private onLoginClickWithCheck = async (ev?: ButtonEvent) => {
  //   ev?.preventDefault();

  //   const sessionLoaded = await loadSession({ ignoreGuest: true });
  //   if (!sessionLoaded) {
  //     // ok fine, there's still no session: really go to the login page
  //     this.props.onLoginClick();
  //   }

  //   return sessionLoaded;
  // };

  private renderRegisterComponent() {
    if (this.state.matrixClient && this.state.doingUIAuth) {
      return (
        <InteractiveAuth
          matrixClient={this.state.matrixClient}
          makeRequest={(params) =>
            this.makeRegisterRequest(this.state.matrixClient!, params)
          }
          onAuthFinished={this.onUIAuthFinished}
          inputs={this.getUIAuthInputs()}
          requestEmailToken={this.requestEmailToken}
          sessionId={this.props.sessionId}
          clientSecret={this.props.clientSecret}
          emailSid={this.props.idSid}
          poll={true}
        />
      );
    } else if (!this.state.matrixClient && !this.state.busy) {
      return null;
    } else if (this.state.busy || !this.state.flows) {
      return (
        <div className="mx_AuthBody_spinner">
          <Spinner />
        </div>
      );
    } else if (this.state.flows.length) {
      let ssoSection;
      if (this.state.ssoFlow) {
        // i18n: ssoButtons & usernamePassword are placeholders to help translators understand context
        ssoSection = (
          <React.Fragment>
            <div className={AuthStyles.OrSeparator}>Or</div>
            <SSOButtons
              matrixClient={this.loginLogic.createTemporaryClient()}
              flow={this.state.ssoFlow}
              loginType={
                this.state.ssoFlow.type === "m.login.sso" ? "sso" : "cas"
              }
              pageAfterLogin={this.props.pageAfterLogin}
            />
          </React.Fragment>
        );
      }

      return (
        <React.Fragment>
          <RegistrationForm
            defaultUsername={this.state.formVals.username}
            defaultEmail={this.state.formVals.email}
            defaultPhoneCountry={this.state.formVals.phoneCountry}
            defaultPhoneNumber={this.state.formVals.phoneNumber}
            defaultPassword={this.state.formVals.password}
            onRegisterClick={this.onFormSubmit}
            flows={this.state.flows}
            serverConfig={this.props.serverConfig}
            canSubmit={!this.state.serverErrorIsFatal}
          />
          {ssoSection}
        </React.Fragment>
      );
    }
  }

  render() {
    let errorTextSection;
    const errorText = this.state.errorText;
    if (errorText) {
      errorTextSection = (
        <div className={AuthStyles.AuthError}>
          <SectionMessage appearance="error" key="error">
            <p>{errorText}</p>
          </SectionMessage>
        </div>
      );
    }

    let serverDeadSection;
    if (!this.state.serverIsAlive) {
      const classes = classNames({
        mx_Login_error: true,
        mx_Login_serverError: true,
        mx_Login_serverErrorNonFatal: !this.state.serverErrorIsFatal,
      });
      serverDeadSection = (
        <div className={classes}>{this.state.serverDeadError}</div>
      );
    }

    // Only show the 'go back' button if you're not looking at the form
    let goBack;
    if (this.state.doingUIAuth) {
      goBack = (
        // eslint-disable-next-line jsx-a11y/anchor-is-valid
        <a
          className="mx_AuthBody_changeFlow"
          onClick={this.onGoToFormClicked}
          href="#">
          Go back
        </a>
      );
    }

    let body;
    if (this.state.completedNoSignin) {
      let regDoneText;
      if (this.state.differentLoggedInUserId) {
        regDoneText = (
          <div>
            <p>
              Your new account ({this.state.registeredUsername}) is registered,
              but you're already logged into a different account (
              {this.state.differentLoggedInUserId}).
            </p>
            <p>
              <Button
                className="mx_linkButton"
                onClick={this.props.onLoginClick}>
                {"Continue with previous account"}
              </Button>
            </p>
          </div>
        );
      } else if (this.state.formVals.password) {
        // We're the client that started the registration
        regDoneText = (
          <h3>
            <a href="/login" onClick={this.props.onLoginClick}>
              Log in
            </a>{" "}
            to your new account.
          </h3>
        );
      } else {
        // We're not the original client: the user probably got to us by clicking the
        // email validation link. We can't offer a 'go straight to your account' link
        // as we don't have the original creds.
        regDoneText = (
          <h3>
            You can now close this window or{" "}
            <a href="/login" onClick={this.props.onLoginClick}>
              log in
            </a>{" "}
            to your new account.
          </h3>
        );
      }
      body = (
        <div>
          <h2>Registration Successful</h2>
          {regDoneText}
        </div>
      );
    } else {
      body = (
        <>
          {/* <PageHeader>Create account</PageHeader> */}
          {serverDeadSection}
          {/* <ServerPicker
            title={"Host account on"}
            dialogTitle={"Decide where your account is hosted"}
            serverConfig={this.props.serverConfig}
            onServerConfigChange={
              this.state.doingUIAuth
                ? undefined
                : this.props.onServerConfigChange
            }
          /> */}
          {this.renderRegisterComponent()}
          {goBack}
          <div className={AuthStyles.AuthFormFooter}>
            <Button
              appearance="link"
              onClick={(e, _) => this.onLoginClick(e)}
              href="#">
              Already have an account? Sign in
            </Button>
          </div>
        </>
      );
    }

    // Renders the components that make up the registration page
    return (
      <div className={AuthStyles.AuthPage}>
        <div className={AuthStyles.AuthHeader}>
          <div className={AuthStyles.AuthHeaderLogo}>
            <Logo></Logo>
          </div>
        </div>
        <div className={AuthStyles.AuthBody}>
          <div className={AuthStyles.AuthForm}>
            {errorTextSection}
            {body}
          </div>
        </div>
        <div className={AuthStyles.AuthFooter}>
          <HelperMessage>Powered by Matrix</HelperMessage>
        </div>
      </div>
    );
  }
}
