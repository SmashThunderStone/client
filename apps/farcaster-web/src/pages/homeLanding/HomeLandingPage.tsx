import { AnalyticsEvent } from 'farcaster-analytics';
import React, { useState } from 'react';

import { APP_NAME } from '~/brand/brand';
import { SmashCastWordmark } from '~/brand/SmashCastMark';
import { Image } from '~/components/images/Image';
import { ExternalLink } from '~/components/links/ExternalLink';
import { Link } from '~/components/links/Link';
import { LogoBrandContextMenu } from '~/components/LogoBrandContextMenu';
import { LoginMagicLinkModal } from '~/components/modals/LoginMagicLinkModal';
import { LoginModal } from '~/components/modals/LoginModal';
import { Page } from '~/components/page/Page';
import { useAnalytics } from '~/contexts/AnalyticsProvider';
import { isMobile } from '~/utils/navigatorUtils';

import LandingVideo from './LandingVideo.mp4';

export function HomeLandingPage() {
  const { dangerouslyTrackPreAuthEvent, trackEvent } = useAnalytics();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingInWithMagicLink, setIsLoggingInWithMagicLink] =
    useState(false);

  return (
    <Page className="landing-bg" meta={{ title: APP_NAME }}>
      <div className="hidden min-h-dvh w-full flex-col p-[60px] sm:flex">
        <div className="flex flex-row items-center space-x-3 text-md">
          <LogoBrandContextMenu>
            <SmashCastWordmark className="text-white" />
          </LogoBrandContextMenu>
        </div>
        <div className="mx-auto mb-8 flex max-w-screen-lg flex-1 flex-col justify-center">
          <div className="flex flex-row items-stretch justify-center ">
            <div className="relative h-[580px] w-[280px] overflow-hidden rounded-[49px]">
              <video
                src={LandingVideo}
                className="absolute inset-0 h-full w-full origin-center object-cover"
                style={{ transform: 'scale(1.1)' }}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden
                tabIndex={-1}
              />
            </div>
            <div className="ml-[50px] flex w-[405px] flex-col py-4">
              <h2 className="text-nowrap font-seasonMix text-3xl font-semibold text-light">
                Build. Share. Grow.
              </h2>
              <div className="mt-[25px] text-[rgba(255,255,255,0.8)]">
                SmashCast is a client for the Farcaster protocol. Find people
                and post on a decentralized social network where you own your
                identity.
              </div>
              <div className="mt-[35px] flex flex-col space-y-3">
                {isMobile() ? (
                  <ExternalLink
                    href="https://link.farcaster.xyz/download"
                    title="Sign up"
                  >
                    <div className="flex w-full items-center justify-center rounded-[300px] bg-[var(--smashcast-red)] px-[36px] py-[10px] hover:bg-[var(--smashcast-red-hover)] ">
                      <div className="text-[16px] text-light">Sign up</div>
                    </div>
                  </ExternalLink>
                ) : (
                  <Link
                    to="signup"
                    params={{}}
                    searchParams={{}}
                    title="Sign up"
                  >
                    <div className="flex w-full items-center justify-center rounded-[300px] bg-[var(--smashcast-red)] px-[36px] py-[10px] hover:bg-[var(--smashcast-red-hover)]">
                      <div className="text-[16px] text-light">Sign up</div>
                    </div>
                  </Link>
                )}
                <div className="flex flex-row items-center space-x-2 py-2">
                  <div className="h-px grow bg-[rgba(255,255,255,0.5)]" />
                  <div className="text-sm text-[rgba(255,255,255,0.5)]">or</div>
                  <div className="h-px grow bg-[rgba(255,255,255,0.5)]" />
                </div>
                <div
                  className="landing-btn-secondary-bg flex w-full cursor-pointer items-center justify-center rounded-[300px] px-[36px] py-[10px]"
                  onClick={() => {
                    trackEvent(AnalyticsEvent.ClickedMagicLink, undefined);
                    setIsLoggingInWithMagicLink(true);
                  }}
                >
                  <div className="text-[16px] text-light">
                    Log in with email
                  </div>
                </div>
                <div
                  className="landing-btn-secondary-bg flex w-full cursor-pointer items-center justify-center rounded-[300px] px-[36px] py-[10px]"
                  onClick={() => {
                    dangerouslyTrackPreAuthEvent(
                      AnalyticsEvent.ClickedLogin,
                      undefined,
                    );
                    setIsLoggingIn(true);
                  }}
                >
                  <div className="text-[16px] text-light">
                    Log in with phone
                  </div>
                </div>
              </div>
              <div className="mt-[35px] flex flex-col space-y-3">
                <div className="flex flex-row items-center space-x-2 py-2">
                  <div className="h-px grow bg-[rgba(255,255,255,0.8)]" />
                  <div className="text-sm text-[rgba(255,255,255,0.8)]">
                    Download the app
                  </div>
                  <div className="h-px grow bg-[rgba(255,255,255,0.8)]" />
                </div>
                <div className="mt-3 flex flex-row space-x-3">
                  <ExternalLink
                    href="https://apps.apple.com/us/app/farcaster/id1600555445"
                    title="Download iOS app"
                    onClick={() => {
                      dangerouslyTrackPreAuthEvent(
                        AnalyticsEvent.ClickedDownloadApple,
                        undefined,
                      );
                    }}
                  >
                    <Image
                      alt="Download iOS app"
                      className="max-h-[60px]"
                      src={'https://farcaster.xyz/~/images/DownloadApple.png'}
                    />
                  </ExternalLink>
                  <ExternalLink
                    href="https://play.google.com/store/apps/details?id=com.farcaster.mobile"
                    title="Download Android app"
                    onClick={() => {
                      dangerouslyTrackPreAuthEvent(
                        AnalyticsEvent.ClickedDownloadGoogle,
                        undefined,
                      );
                    }}
                  >
                    <Image
                      alt="Download Android app"
                      className="max-h-[60px]"
                      src={'https://farcaster.xyz/~/images/DownloadGoogle.png'}
                    />
                  </ExternalLink>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex w-full flex-row items-center justify-between">
          <div className="flex flex-row items-center space-x-0.5">
            <span className="font-seasonMix text-[rgba(255,255,255,0.5)]">
              Copyright © {new Date().getFullYear()} Neynar. All rights
              reserved.
            </span>
          </div>
          <div className="flex flex-row items-center space-x-6">
            <ExternalLink
              href="https://docs.farcaster.xyz"
              title="Developers"
              className="font-seasonMix text-[rgba(255,255,255,0.8)] hover:underline"
            >
              Developers
            </ExternalLink>
            <Link
              to="support"
              params={{}}
              searchParams={{}}
              title="Support"
              className="font-seasonMix text-[rgba(255,255,255,0.8)] hover:underline"
            >
              Support
            </Link>
            <Link
              to="privacyPolicy"
              params={{}}
              searchParams={{}}
              title="Privacy Policy"
              className="font-seasonMix text-[rgba(255,255,255,0.8)] hover:underline"
            >
              Privacy
            </Link>
            <Link
              to="termsOfUse"
              params={{}}
              searchParams={{}}
              title="Terms of Use"
              className="font-seasonMix text-[rgba(255,255,255,0.8)] hover:underline"
            >
              Terms
            </Link>
          </div>
        </div>
      </div>
      <div className="container mx-auto flex h-dvh flex-col justify-center p-4 sm:hidden">
        <div className="flex h-full flex-col">
          <div className="my-3 flex w-full flex-none flex-row items-center justify-center">
            <div className="flex flex-row items-center space-x-3 text-md">
              <SmashCastWordmark className="text-white" />
            </div>
          </div>
          <div className="relative flex flex-1 flex-col items-center pt-4">
            <div className="relative mx-auto aspect-[9/19] w-[280px] overflow-hidden rounded-[49px]">
              <video
                src={LandingVideo}
                className="absolute inset-0 h-full w-full origin-center object-cover"
                style={{ transform: 'scale(1.1)' }}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden
                tabIndex={-1}
              />
            </div>
            <div className="absolute inset-x-0 bottom-0">
              <div className="glass-landing-bg rounded-t-[40px] pb-8">
                <div className="rounded-lg px-6 pt-6">
                  <h2 className="flex-1 text-nowrap font-seasonMix text-3xl font-semibold text-light">
                    Build. Share. Grow.
                  </h2>
                  <div className="my-[25px] text-[rgba(255,255,255,0.8)]">
                    SmashCast is a client for the Farcaster protocol. Find
                    people and post on a decentralized social network where you
                    own your identity.
                  </div>
                  <div>
                    <div className="flex flex-row items-center space-x-2 py-2">
                      <div className="h-px grow bg-[rgba(255,255,255,0.5)]" />
                      <div className="text-sm text-[rgba(255,255,255,0.5)]">
                        Download the app
                      </div>
                      <div className="h-px grow bg-[rgba(255,255,255,0.5)]" />
                    </div>
                    <div className="mt-3 flex flex-row space-x-3">
                      <ExternalLink
                        href="https://apps.apple.com/us/app/farcaster/id1600555445"
                        title="Download iOS app"
                        onClick={() => {
                          dangerouslyTrackPreAuthEvent(
                            AnalyticsEvent.ClickedDownloadApple,
                            undefined,
                          );
                        }}
                      >
                        <Image
                          alt="Download iOS app"
                          className="max-h-[60px]"
                          src={
                            'https://farcaster.xyz/~/images/DownloadApple.png'
                          }
                        />
                      </ExternalLink>
                      <ExternalLink
                        href="https://play.google.com/store/apps/details?id=com.farcaster.mobile"
                        title="Download Android app"
                        onClick={() => {
                          dangerouslyTrackPreAuthEvent(
                            AnalyticsEvent.ClickedDownloadGoogle,
                            undefined,
                          );
                        }}
                      >
                        <Image
                          alt="Download Android app"
                          className="max-h-[60px]"
                          src={
                            'https://farcaster.xyz/~/images/DownloadGoogle.png'
                          }
                        />
                      </ExternalLink>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {isLoggingIn && <LoginModal onClose={() => setIsLoggingIn(false)} />}
      {isLoggingInWithMagicLink && (
        <LoginMagicLinkModal
          onClose={() => setIsLoggingInWithMagicLink(false)}
        />
      )}
    </Page>
  );
}
