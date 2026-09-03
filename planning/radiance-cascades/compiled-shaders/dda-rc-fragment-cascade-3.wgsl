// Three.js r185 - Node System

// global
diagnostic( off, derivative_uniformity );


// structs

struct OutputStruct {
	@location( 0 ) color: vec4<f32>
};
var<private> output : OutputStruct;

// uniforms
@binding( 1 ) @group( 1 ) var nodeUniform6 : texture_2d<f32>;
@binding( 2 ) @group( 1 ) var nodeUniform7 : texture_2d<f32>;
@binding( 3 ) @group( 1 ) var nodeUniform8 : texture_2d<f32>;

struct objectStruct {
	nodeUniform0 : vec2<f32>,
	nodeUniform1 : f32,
	nodeUniform2 : vec2<f32>,
	nodeUniform3 : f32,
	nodeUniform4 : vec2<f32>,
	nodeUniform5 : vec2<f32>,
	nodeUniform9 : f32,
	nodeUniform10 : f32,
	nodeUniform13 : mat4x4<f32>
};
@binding( 0 ) @group( 1 )
var<uniform> object : objectStruct;

// vars
var<private> nodeVar0 : f32;
var<private> nodeVar1 : vec3<f32>;
var<private> nodeVar2 : f32;
var<private> nodeVar3 : f32;
var<private> nodeVar4 : vec2<f32>;
var<private> nodeVar5 : bool;
var<private> nodeVar6 : vec2<f32>;
var<private> nodeVar7 : bool;
var<private> nodeVar8 : f32;
var<private> nodeVar9 : f32;
var<private> nodeVar10 : vec2<f32>;
var<private> nodeVar11 : vec2<f32>;
var<private> nodeVar12 : vec2<f32>;
var<private> nodeVar13 : i32;
var<private> nodeVar14 : i32;
var<private> nodeVar15 : i32;
var<private> nodeVar16 : i32;
var<private> nodeVar17 : vec2<i32>;
var<private> nodeVar18 : f32;
var<private> nodeVar19 : f32;
var<private> nodeVar20 : i32;
var<private> nodeVar21 : i32;
var<private> nodeVar22 : i32;
var<private> nodeVar23 : i32;
var<private> nodeVar24 : i32;
var<private> nodeVar25 : i32;
var<private> nodeVar26 : vec2<i32>;
var<private> nodeVar27 : vec3<f32>;
var<private> nodeVar28 : f32;
var<private> nodeVar29 : f32;
var<private> nodeVar30 : f32;
var<private> nodeVar31 : f32;
var<private> nodeVar32 : f32;
var<private> nodeVar33 : i32;
var<private> nodeVar34 : i32;
var<private> nodeVar35 : i32;
var<private> nodeVar36 : i32;
var<private> nodeVar37 : i32;
var<private> nodeVar38 : i32;
var<private> nodeVar39 : vec4<f32>;
var<private> nodeVar40 : i32;
var<private> nodeVar41 : i32;
var<private> nodeVar42 : i32;
var<private> nodeVar43 : i32;
var<private> nodeVar44 : i32;
var<private> nodeVar45 : i32;
var<private> nodeVar46 : i32;
var<private> nodeVar47 : i32;
var<private> nodeVar48 : i32;
var<private> nodeVar49 : i32;
var<private> nodeVar50 : i32;
var<private> nodeVar51 : i32;
var<private> nodeVar52 : i32;
var<private> nodeVar53 : vec4<f32>;
var<private> nodeVar54 : i32;
var<private> nodeVar55 : i32;
var<private> nodeVar56 : i32;
var<private> nodeVar57 : i32;
var<private> nodeVar58 : i32;
var<private> nodeVar59 : i32;
var<private> nodeVar60 : i32;
var<private> nodeVar61 : i32;
var<private> nodeVar62 : i32;
var<private> nodeVar63 : i32;
var<private> nodeVar64 : i32;
var<private> nodeVar65 : i32;
var<private> nodeVar66 : i32;
var<private> nodeVar67 : vec4<f32>;
var<private> nodeVar68 : f32;
var<private> nodeVar69 : f32;
var<private> nodeVar70 : f32;
var<private> nodeVar71 : vec4<f32>;
var<private> nodeVar72 : i32;
var<private> nodeVar73 : f32;
var<private> nodeVar74 : i32;
var<private> nodeVar75 : i32;
var<private> nodeVar76 : i32;
var<private> nodeVar77 : i32;
var<private> nodeVar78 : i32;
var<private> nodeVar79 : i32;
var<private> nodeVar80 : vec4<f32>;
var<private> nodeVar81 : f32;
var<private> nodeVar82 : f32;
var<private> nodeVar83 : f32;
var<private> nodeVar84 : i32;
var<private> nodeVar85 : i32;
var<private> nodeVar86 : i32;
var<private> nodeVar87 : i32;
var<private> nodeVar88 : i32;
var<private> nodeVar89 : i32;
var<private> nodeVar90 : vec4<f32>;
var<private> nodeVar91 : f32;
var<private> nodeVar92 : f32;
var<private> nodeVar93 : f32;
var<private> nodeVar94 : vec3<f32>;
var<private> nodeVar95 : vec3<f32>;
var<private> nodeVar96 : vec4<f32>;
var<private> nodeVar97 : vec4<f32>;
var<private> nodeVar98 : vec3<f32>;
var<private> nodeVar99 : vec4<f32>;
var<private> nodeVar100 : f32;
var<private> nodeVar101 : f32;
var<private> nodeVar102 : vec3<f32>;
var<private> nodeVar103 : f32;
var<private> nodeVar104 : vec4<f32>;

// codes
fn tsl_mod_vec2( x : vec2f, y : vec2f ) -> vec2f { return x - y * floor( x / y ); }


@fragment
fn main( @location( 0 ) nodeVarying4 : vec2<f32> ) -> OutputStruct {

	// flow
	// code

	let rcFragCoord = ( nodeVarying4 * vec2<f32>( 672.0, 416.0 ) );
	let rcProbeGroupSize = vec2<f32>( 21.0, 13.0 );
	let rcRayXY = floor( ( rcFragCoord / rcProbeGroupSize ) );
	let rcProbeXY = tsl_mod_vec2( rcFragCoord, rcProbeGroupSize );
	let rcRayIndex = ( rcRayXY.x + ( rcRayXY.y * 32.0 ) );
	let rcActiveProbeXY = clamp( rcProbeXY, vec2<f32>( 0.5, 0.5 ), vec2<f32>( 20.5, 12.5 ) );
	let rcProbeUV = clamp( ( ( rcActiveProbeXY * vec2<f32>( 8.0 ) ) / vec2<f32>( 168.0, 98.0 ) ), vec2<f32>( 0.0 ), vec2<f32>( 1.0 ) );
	let rcProbeLocalPos = ( rcProbeUV * object.nodeUniform0 );
	let rcTheta = ( ( rcRayIndex + 0.5 ) * 0.006135923151542565 );
	let rcRayDirection = vec2<f32>( cos( rcTheta ), sin( rcTheta ) );
	let rcSegmentStartLocal = ( rcProbeLocalPos + ( rcRayDirection * vec2<f32>( object.nodeUniform1 ) ) );
	let rcSegmentStart = ( rcSegmentStartLocal + object.nodeUniform2 );

	if ( ( 0.0 > 0.5 ) ) {

		nodeVar0 = object.nodeUniform3;

	} else {

		nodeVar0 = object.nodeUniform3;

	}

	let rcTraceLimit = nodeVar0;
	nodeVar1 = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar2 = 1.0;
	nodeVar3 = 0.0;
	nodeVar5 = ( abs( rcRayDirection.x ) < 0.000001 );
	nodeVar6 = ( object.nodeUniform4 + object.nodeUniform5 );
	nodeVar7 = ( abs( rcRayDirection.y ) < 0.000001 );

	if ( ( ( nodeVar5 && ( ( rcSegmentStart.x < object.nodeUniform4.x ) || ( rcSegmentStart.x > nodeVar6.x ) ) ) || ( nodeVar7 && ( ( rcSegmentStart.y < object.nodeUniform4.y ) || ( rcSegmentStart.y > nodeVar6.y ) ) ) ) ) {

		nodeVar4 = vec2<f32>( 1.0, -1.0 );

	} else {


		if ( nodeVar5 ) {

			nodeVar8 = 0.000001;

		} else {

			nodeVar8 = rcRayDirection.x;

		}


		if ( nodeVar7 ) {

			nodeVar9 = 0.000001;

		} else {

			nodeVar9 = rcRayDirection.y;

		}

		nodeVar10 = ( vec2<f32>( 1.0 ) / vec2<f32>( nodeVar8, nodeVar9 ) );
		nodeVar11 = ( ( object.nodeUniform4 - rcSegmentStart ) * nodeVar10 );
		nodeVar12 = ( ( nodeVar6 - rcSegmentStart ) * nodeVar10 );
		nodeVar4 = vec2<f32>( max( min( nodeVar11.x, nodeVar12.x ), min( nodeVar11.y, nodeVar12.y ) ), min( max( nodeVar11.x, nodeVar12.x ), max( nodeVar11.y, nodeVar12.y ) ) );

	}

	let rcBoundsInterval = nodeVar4;
	let rcTraceEntry = max( rcBoundsInterval.x, 0.0 );
	let rcTraceExit = min( rcBoundsInterval.y, rcTraceLimit );
	let rcIntersectsWorld = ( rcTraceExit >= rcTraceEntry );
	let nodeConst0 = vec2<f32>( 2.0, 2.0 );
	let nodeConst1 = 0.00196078431372549;
	let nodeConst2 = ( rcSegmentStart + ( rcRayDirection * vec2<f32>( rcTraceEntry ) ) );
	let nodeConst3 = clamp( ( ( nodeConst2 - object.nodeUniform4 ) / object.nodeUniform5 ), vec2<f32>( 0.0 ), vec2<f32>( 1.0 ) );
	let nodeConst4 = vec2<f32>( nodeConst3.x, ( 1.0 - nodeConst3.y ) );
	let nodeConst5 = clamp( ( nodeConst4 * nodeConst0 ), vec2<f32>( 0.0, 0.0 ), ( nodeConst0 - vec2<f32>( 0.0001 ) ) );
	let nodeConst6 = vec2<f32>( ( ( rcRayDirection.x / object.nodeUniform5.x ) * nodeConst0.x ), ( ( ( rcRayDirection.y / object.nodeUniform5.y ) * nodeConst0.y ) * -1.0 ) );
	let nodeConst7 = ( abs( nodeConst6.x ) < 1e-8 );
	let nodeConst8 = ( abs( nodeConst6.y ) < 1e-8 );

	if ( nodeConst7 ) {

		nodeVar13 = 0;

	} else {


		if ( ( nodeConst6.x > 0.0 ) ) {

			nodeVar14 = 1;

		} else {

			nodeVar14 = -1;

		}

		nodeVar13 = nodeVar14;

	}


	if ( nodeConst8 ) {

		nodeVar15 = 0;

	} else {


		if ( ( nodeConst6.y > 0.0 ) ) {

			nodeVar16 = 1;

		} else {

			nodeVar16 = -1;

		}

		nodeVar15 = nodeVar16;

	}

	let nodeConst9 = vec2<i32>( nodeVar13, nodeVar15 );
	let nodeConst10 = clamp( ( nodeConst5 + ( vec2<f32>( nodeConst9 ) * vec2<f32>( 0.00001 ) ) ), vec2<f32>( 0.0, 0.0 ), ( nodeConst0 - vec2<f32>( 0.0001 ) ) );
	nodeVar17 = vec2<i32>( i32( floor( nodeConst10.x ) ), i32( floor( nodeConst10.y ) ) );

	if ( ( nodeConst9.x > 0 ) ) {

		nodeVar18 = f32( ( nodeVar17.x + 1 ) );

	} else {

		nodeVar18 = f32( nodeVar17.x );

	}


	if ( ( nodeConst9.y > 0 ) ) {

		nodeVar19 = f32( ( nodeVar17.y + 1 ) );

	} else {

		nodeVar19 = f32( nodeVar17.y );

	}

	let nodeConst11 = vec2<f32>( nodeVar18, nodeVar19 );
	let nodeConst12 = i32( floor( ( ( clamp( ( 1.0 / abs( nodeConst6.x ) ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );
	let nodeConst13 = i32( floor( ( ( clamp( ( 1.0 / abs( nodeConst6.y ) ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

	if ( ( nodeConst12 < 1 ) ) {

		nodeVar20 = 1;

	} else {

		nodeVar20 = nodeConst12;

	}

	let nodeConst14 = nodeVar20;

	if ( ( nodeConst13 < 1 ) ) {

		nodeVar21 = 1;

	} else {

		nodeVar21 = nodeConst13;

	}

	let nodeConst15 = nodeVar21;

	if ( nodeConst7 ) {

		nodeVar22 = 1073741823;

	} else {

		nodeVar22 = nodeConst14;

	}


	if ( nodeConst8 ) {

		nodeVar23 = 1073741823;

	} else {

		nodeVar23 = nodeConst15;

	}

	let nodeConst16 = vec2<i32>( nodeVar22, nodeVar23 );

	if ( nodeConst7 ) {

		nodeVar24 = 1073741823;

	} else {

		nodeVar24 = i32( floor( ( ( clamp( ( ( nodeConst11.x - nodeConst5.x ) / nodeConst6.x ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

	}


	if ( nodeConst8 ) {

		nodeVar25 = 1073741823;

	} else {

		nodeVar25 = i32( floor( ( ( clamp( ( ( nodeConst11.y - nodeConst5.y ) / nodeConst6.y ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

	}

	nodeVar26 = vec2<i32>( nodeVar24, nodeVar25 );
	let nodeConst17 = i32( floor( ( ( clamp( max( ( rcTraceExit - rcTraceEntry ), 0.0 ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );
	nodeVar27 = vec3<f32>( 0.0, 0.0, 0.0 );

	if ( ( ! rcIntersectsWorld ) ) {

		nodeVar28 = 1.0;

	} else {

		nodeVar28 = 0.0;

	}

	nodeVar29 = nodeVar28;

	if ( rcIntersectsWorld ) {

		nodeVar30 = 1.0;

	} else {

		nodeVar30 = 0.0;

	}

	nodeVar31 = nodeVar30;
	nodeVar32 = 0.0;

	if ( rcIntersectsWorld ) {


		for ( var i : i32 = 0; i < 5; i ++ ) {

			nodeVar34 = ( nodeVar17.x >> 2u );

			if ( ( nodeVar34 < 0 ) ) {

				nodeVar33 = 0;

			} else {


				if ( ( nodeVar34 > 0 ) ) {

					nodeVar35 = 0;

				} else {

					nodeVar35 = nodeVar34;

				}

				nodeVar33 = nodeVar35;

			}

			nodeVar37 = ( nodeVar17.y >> 2u );

			if ( ( nodeVar37 < 0 ) ) {

				nodeVar36 = 0;

			} else {


				if ( ( nodeVar37 > 0 ) ) {

					nodeVar38 = 0;

				} else {

					nodeVar38 = nodeVar37;

				}

				nodeVar36 = nodeVar38;

			}

			let nodeConst18 = vec2<i32>( nodeVar33, nodeVar36 );
			nodeVar39 = textureLoad( nodeUniform6, nodeConst18, u32( 0u ) );
			let nodeConst19 = nodeVar39.xyz;
			let nodeConst20 = nodeConst19;
			let nodeConst21 = ( ( ( ( ( nodeConst20.x < nodeConst1 ) && ( nodeConst20.y < nodeConst1 ) ) && ( nodeConst20.z < nodeConst1 ) ) && ( nodeVar31 < 0.5 ) ) && ( nodeVar32 < 0.5 ) );

			if ( nodeConst21 ) {

				let nodeConst22 = ( nodeVar17.x & 3 );
				let nodeConst23 = ( nodeVar17.y & 3 );

				if ( ( nodeConst9.x > 0 ) ) {

					nodeVar40 = ( 4 - nodeConst22 );

				} else {

					nodeVar40 = ( nodeConst22 + 1 );

				}

				let nodeConst24 = nodeVar40;

				if ( ( nodeConst9.y > 0 ) ) {

					nodeVar41 = ( 4 - nodeConst23 );

				} else {

					nodeVar41 = ( nodeConst23 + 1 );

				}

				let nodeConst25 = nodeVar41;

				if ( nodeConst7 ) {

					nodeVar42 = 1073741823;

				} else {

					nodeVar42 = ( nodeVar26.x + ( nodeConst16.x * ( nodeConst24 - 1 ) ) );

				}

				let nodeConst26 = nodeVar42;

				if ( nodeConst8 ) {

					nodeVar43 = 1073741823;

				} else {

					nodeVar43 = ( nodeVar26.y + ( nodeConst16.y * ( nodeConst25 - 1 ) ) );

				}

				let nodeConst27 = nodeVar43;
				let nodeConst28 = ( abs( ( nodeConst26 - nodeConst27 ) ) <= 1 );

				if ( ( ! nodeConst28 ) ) {


					if ( ( nodeConst26 < nodeConst27 ) ) {

						nodeVar44 = nodeConst26;

					} else {

						nodeVar44 = nodeConst27;

					}

					let nodeConst29 = nodeVar44;

					if ( ( nodeConst29 >= nodeConst17 ) ) {

						nodeVar29 = 1.0;
						break;


					}


					if ( ( nodeConst26 < nodeConst27 ) ) {


						if ( ( nodeVar26.y <= nodeConst29 ) ) {

							nodeVar45 = ( ( ( nodeConst29 - nodeVar26.y ) / nodeConst16.y ) + 1 );

						} else {

							nodeVar45 = 0;

						}

						let nodeConst30 = nodeVar45;
						nodeVar17.x = ( nodeVar17.x + ( nodeConst9.x * nodeConst24 ) );
						nodeVar17.y = ( nodeVar17.y + ( nodeConst9.y * nodeConst30 ) );
						nodeVar26.x = ( nodeVar26.x + ( nodeConst16.x * nodeConst24 ) );
						nodeVar26.y = ( nodeVar26.y + ( nodeConst16.y * nodeConst30 ) );
						continue;


					} else {


						if ( ( nodeVar26.x <= nodeConst29 ) ) {

							nodeVar46 = ( ( ( nodeConst29 - nodeVar26.x ) / nodeConst16.x ) + 1 );

						} else {

							nodeVar46 = 0;

						}

						let nodeConst31 = nodeVar46;
						nodeVar17.x = ( nodeVar17.x + ( nodeConst9.x * nodeConst31 ) );
						nodeVar17.y = ( nodeVar17.y + ( nodeConst9.y * nodeConst25 ) );
						nodeVar26.x = ( nodeVar26.x + ( nodeConst16.x * nodeConst31 ) );
						nodeVar26.y = ( nodeVar26.y + ( nodeConst16.y * nodeConst25 ) );
						continue;


					}



				}



			}

			nodeVar48 = ( nodeVar17.x >> 1u );

			if ( ( nodeVar48 < 0 ) ) {

				nodeVar47 = 0;

			} else {


				if ( ( nodeVar48 > 0 ) ) {

					nodeVar49 = 0;

				} else {

					nodeVar49 = nodeVar48;

				}

				nodeVar47 = nodeVar49;

			}

			nodeVar51 = ( nodeVar17.y >> 1u );

			if ( ( nodeVar51 < 0 ) ) {

				nodeVar50 = 0;

			} else {


				if ( ( nodeVar51 > 0 ) ) {

					nodeVar52 = 0;

				} else {

					nodeVar52 = nodeVar51;

				}

				nodeVar50 = nodeVar52;

			}

			let nodeConst32 = vec2<i32>( nodeVar47, nodeVar50 );
			nodeVar53 = textureLoad( nodeUniform7, nodeConst32, u32( 0u ) );
			let nodeConst33 = nodeVar53.xyz;
			let nodeConst34 = nodeConst33;
			let nodeConst35 = ( ( ( ( ( nodeConst34.x < nodeConst1 ) && ( nodeConst34.y < nodeConst1 ) ) && ( nodeConst34.z < nodeConst1 ) ) && ( nodeVar31 < 0.5 ) ) && ( nodeVar32 < 0.5 ) );

			if ( nodeConst35 ) {

				let nodeConst36 = ( nodeVar17.x & 1 );
				let nodeConst37 = ( nodeVar17.y & 1 );

				if ( ( nodeConst9.x > 0 ) ) {

					nodeVar54 = ( 2 - nodeConst36 );

				} else {

					nodeVar54 = ( nodeConst36 + 1 );

				}

				let nodeConst38 = nodeVar54;

				if ( ( nodeConst9.y > 0 ) ) {

					nodeVar55 = ( 2 - nodeConst37 );

				} else {

					nodeVar55 = ( nodeConst37 + 1 );

				}

				let nodeConst39 = nodeVar55;

				if ( nodeConst7 ) {

					nodeVar56 = 1073741823;

				} else {

					nodeVar56 = ( nodeVar26.x + ( nodeConst16.x * ( nodeConst38 - 1 ) ) );

				}

				let nodeConst40 = nodeVar56;

				if ( nodeConst8 ) {

					nodeVar57 = 1073741823;

				} else {

					nodeVar57 = ( nodeVar26.y + ( nodeConst16.y * ( nodeConst39 - 1 ) ) );

				}

				let nodeConst41 = nodeVar57;
				let nodeConst42 = ( abs( ( nodeConst40 - nodeConst41 ) ) <= 1 );

				if ( ( ! nodeConst42 ) ) {


					if ( ( nodeConst40 < nodeConst41 ) ) {

						nodeVar58 = nodeConst40;

					} else {

						nodeVar58 = nodeConst41;

					}

					let nodeConst43 = nodeVar58;

					if ( ( nodeConst43 >= nodeConst17 ) ) {

						nodeVar29 = 1.0;
						break;


					}


					if ( ( nodeConst40 < nodeConst41 ) ) {


						if ( ( nodeVar26.y <= nodeConst43 ) ) {

							nodeVar59 = ( ( ( nodeConst43 - nodeVar26.y ) / nodeConst16.y ) + 1 );

						} else {

							nodeVar59 = 0;

						}

						let nodeConst44 = nodeVar59;
						nodeVar17.x = ( nodeVar17.x + ( nodeConst9.x * nodeConst38 ) );
						nodeVar17.y = ( nodeVar17.y + ( nodeConst9.y * nodeConst44 ) );
						nodeVar26.x = ( nodeVar26.x + ( nodeConst16.x * nodeConst38 ) );
						nodeVar26.y = ( nodeVar26.y + ( nodeConst16.y * nodeConst44 ) );
						continue;


					} else {


						if ( ( nodeVar26.x <= nodeConst43 ) ) {

							nodeVar60 = ( ( ( nodeConst43 - nodeVar26.x ) / nodeConst16.x ) + 1 );

						} else {

							nodeVar60 = 0;

						}

						let nodeConst45 = nodeVar60;
						nodeVar17.x = ( nodeVar17.x + ( nodeConst9.x * nodeConst45 ) );
						nodeVar17.y = ( nodeVar17.y + ( nodeConst9.y * nodeConst39 ) );
						nodeVar26.x = ( nodeVar26.x + ( nodeConst16.x * nodeConst45 ) );
						nodeVar26.y = ( nodeVar26.y + ( nodeConst16.y * nodeConst39 ) );
						continue;


					}



				}



			}

			nodeVar62 = ( nodeVar17.x >> 1u );

			if ( ( nodeVar62 < 0 ) ) {

				nodeVar61 = 0;

			} else {


				if ( ( nodeVar62 > 0 ) ) {

					nodeVar63 = 0;

				} else {

					nodeVar63 = nodeVar62;

				}

				nodeVar61 = nodeVar63;

			}

			nodeVar65 = ( nodeVar17.y >> 1u );

			if ( ( nodeVar65 < 0 ) ) {

				nodeVar64 = 0;

			} else {


				if ( ( nodeVar65 > 0 ) ) {

					nodeVar66 = 0;

				} else {

					nodeVar66 = nodeVar65;

				}

				nodeVar64 = nodeVar66;

			}

			let nodeConst46 = vec2<i32>( nodeVar61, nodeVar64 );
			nodeVar67 = textureLoad( nodeUniform7, nodeConst46, u32( 0u ) );
			let nodeConst47 = nodeVar67.xyz;
			let nodeConst48 = u32( floor( ( ( nodeConst47.x * 255.0 ) + 0.5 ) ) );
			let nodeConst49 = u32( floor( ( ( nodeConst47.y * 255.0 ) + 0.5 ) ) );
			let nodeConst50 = u32( floor( ( ( nodeConst47.z * 255.0 ) + 0.5 ) ) );
			let nodeConst51 = u32( ( ( nodeVar17.x & 1 ) + ( ( nodeVar17.y & 1 ) * 2 ) ) );
			let nodeConst52 = ( 1u << nodeConst51 );

			if ( ( ( nodeConst48 & nodeConst52 ) > 0u ) ) {

				nodeVar68 = 1.0;

			} else {

				nodeVar68 = 0.0;

			}


			if ( ( ( nodeConst49 & nodeConst52 ) > 0u ) ) {

				nodeVar69 = 1.0;

			} else {

				nodeVar69 = 0.0;

			}


			if ( ( ( nodeConst50 & nodeConst52 ) > 0u ) ) {

				nodeVar70 = 1.0;

			} else {

				nodeVar70 = 0.0;

			}

			let nodeConst53 = vec3<f32>( nodeVar68, nodeVar69, nodeVar70 );

			if ( ( nodeConst53.z > 0.5 ) ) {

				nodeVar71 = textureLoad( nodeUniform8, nodeVar17, u32( 0u ) );
				let nodeConst54 = nodeVar71.xyz;

				if ( ( dot( nodeConst54, nodeConst54 ) > 1e-10 ) ) {

					nodeVar27 = nodeConst54;
					nodeVar29 = 2.0;
					break;


				}



			}

			let nodeConst55 = ( nodeConst53.x > 0.5 );
			let nodeConst56 = ( nodeConst53.y > 0.5 );

			if ( ( ( nodeVar31 > 0.5 ) && ( ! nodeConst55 ) ) ) {

				nodeVar31 = 0.0;


			}

			let nodeConst57 = ( nodeVar31 < 0.5 );

			if ( ( ( nodeConst57 && ( nodeVar32 > 0.5 ) ) && ( ! nodeConst56 ) ) ) {

				nodeVar29 = -1.0;
				break;


			}


			if ( ( ( nodeConst57 && nodeConst55 ) && ( ! nodeConst56 ) ) ) {

				nodeVar29 = -1.0;
				break;


			}


			if ( ( nodeConst57 && nodeConst56 ) ) {

				nodeVar32 = 1.0;


			}


			if ( ( nodeVar26.x < nodeVar26.y ) ) {

				nodeVar72 = nodeVar26.x;

			} else {

				nodeVar72 = nodeVar26.y;

			}

			let nodeConst58 = nodeVar72;

			if ( ( nodeConst58 >= nodeConst17 ) ) {


				if ( ( nodeVar32 > 0.5 ) ) {

					nodeVar73 = -1.0;

				} else {

					nodeVar73 = 1.0;

				}

				nodeVar29 = nodeVar73;
				break;


			}

			let nodeConst59 = ( abs( ( nodeVar26.x - nodeVar26.y ) ) <= 1 );
			let nodeConst60 = ( ( ! nodeConst59 ) && ( nodeVar26.x < nodeVar26.y ) );
			let nodeConst61 = ( ( ! nodeConst59 ) && ( nodeVar26.y < nodeVar26.x ) );

			if ( nodeConst59 ) {

				let nodeConst62 = vec2<i32>( ( nodeVar17.x + nodeConst9.x ), nodeVar17.y );
				let nodeConst63 = vec2<i32>( nodeVar17.x, ( nodeVar17.y + nodeConst9.y ) );
				nodeVar75 = ( nodeConst62.x >> 1u );

				if ( ( nodeVar75 < 0 ) ) {

					nodeVar74 = 0;

				} else {


					if ( ( nodeVar75 > 0 ) ) {

						nodeVar76 = 0;

					} else {

						nodeVar76 = nodeVar75;

					}

					nodeVar74 = nodeVar76;

				}

				nodeVar78 = ( nodeConst62.y >> 1u );

				if ( ( nodeVar78 < 0 ) ) {

					nodeVar77 = 0;

				} else {


					if ( ( nodeVar78 > 0 ) ) {

						nodeVar79 = 0;

					} else {

						nodeVar79 = nodeVar78;

					}

					nodeVar77 = nodeVar79;

				}

				let nodeConst64 = vec2<i32>( nodeVar74, nodeVar77 );
				nodeVar80 = textureLoad( nodeUniform7, nodeConst64, u32( 0u ) );
				let nodeConst65 = nodeVar80.xyz;
				let nodeConst66 = u32( floor( ( ( nodeConst65.x * 255.0 ) + 0.5 ) ) );
				let nodeConst67 = u32( floor( ( ( nodeConst65.y * 255.0 ) + 0.5 ) ) );
				let nodeConst68 = u32( floor( ( ( nodeConst65.z * 255.0 ) + 0.5 ) ) );
				let nodeConst69 = u32( ( ( nodeConst62.x & 1 ) + ( ( nodeConst62.y & 1 ) * 2 ) ) );
				let nodeConst70 = ( 1u << nodeConst69 );

				if ( ( ( nodeConst66 & nodeConst70 ) > 0u ) ) {

					nodeVar81 = 1.0;

				} else {

					nodeVar81 = 0.0;

				}


				if ( ( ( nodeConst67 & nodeConst70 ) > 0u ) ) {

					nodeVar82 = 1.0;

				} else {

					nodeVar82 = 0.0;

				}


				if ( ( ( nodeConst68 & nodeConst70 ) > 0u ) ) {

					nodeVar83 = 1.0;

				} else {

					nodeVar83 = 0.0;

				}

				let nodeConst71 = vec3<f32>( nodeVar81, nodeVar82, nodeVar83 );
				nodeVar85 = ( nodeConst63.x >> 1u );

				if ( ( nodeVar85 < 0 ) ) {

					nodeVar84 = 0;

				} else {


					if ( ( nodeVar85 > 0 ) ) {

						nodeVar86 = 0;

					} else {

						nodeVar86 = nodeVar85;

					}

					nodeVar84 = nodeVar86;

				}

				nodeVar88 = ( nodeConst63.y >> 1u );

				if ( ( nodeVar88 < 0 ) ) {

					nodeVar87 = 0;

				} else {


					if ( ( nodeVar88 > 0 ) ) {

						nodeVar89 = 0;

					} else {

						nodeVar89 = nodeVar88;

					}

					nodeVar87 = nodeVar89;

				}

				let nodeConst72 = vec2<i32>( nodeVar84, nodeVar87 );
				nodeVar90 = textureLoad( nodeUniform7, nodeConst72, u32( 0u ) );
				let nodeConst73 = nodeVar90.xyz;
				let nodeConst74 = u32( floor( ( ( nodeConst73.x * 255.0 ) + 0.5 ) ) );
				let nodeConst75 = u32( floor( ( ( nodeConst73.y * 255.0 ) + 0.5 ) ) );
				let nodeConst76 = u32( floor( ( ( nodeConst73.z * 255.0 ) + 0.5 ) ) );
				let nodeConst77 = u32( ( ( nodeConst63.x & 1 ) + ( ( nodeConst63.y & 1 ) * 2 ) ) );
				let nodeConst78 = ( 1u << nodeConst77 );

				if ( ( ( nodeConst74 & nodeConst78 ) > 0u ) ) {

					nodeVar91 = 1.0;

				} else {

					nodeVar91 = 0.0;

				}


				if ( ( ( nodeConst75 & nodeConst78 ) > 0u ) ) {

					nodeVar92 = 1.0;

				} else {

					nodeVar92 = 0.0;

				}


				if ( ( ( nodeConst76 & nodeConst78 ) > 0u ) ) {

					nodeVar93 = 1.0;

				} else {

					nodeVar93 = 0.0;

				}

				let nodeConst79 = vec3<f32>( nodeVar91, nodeVar92, nodeVar93 );
				nodeVar94 = vec3<f32>( 0.0, 0.0, 0.0 );
				nodeVar95 = vec3<f32>( 0.0, 0.0, 0.0 );

				if ( ( nodeConst71.z > 0.5 ) ) {

					nodeVar96 = textureLoad( nodeUniform8, nodeConst62, u32( 0u ) );
					let nodeConst80 = nodeVar96.xyz;
					nodeVar94 = nodeConst80;


				}


				if ( ( nodeConst79.z > 0.5 ) ) {

					nodeVar97 = textureLoad( nodeUniform8, nodeConst63, u32( 0u ) );
					let nodeConst81 = nodeVar97.xyz;
					nodeVar95 = nodeConst81;


				}


				if ( ( dot( nodeVar94, nodeVar94 ) > dot( nodeVar95, nodeVar95 ) ) ) {

					nodeVar98 = nodeVar94;

				} else {

					nodeVar98 = nodeVar95;

				}


				if ( ( dot( nodeVar98, nodeVar98 ) > 1e-10 ) ) {

					nodeVar27 = nodeVar98;
					nodeVar29 = 2.0;
					break;


				}

				let nodeConst82 = ( nodeConst71.y > 0.5 );
				let nodeConst83 = ( nodeConst79.y > 0.5 );
				let nodeConst84 = ( ( nodeConst71.x > 0.5 ) && ( ! nodeConst82 ) );
				let nodeConst85 = ( ( nodeConst79.x > 0.5 ) && ( ! nodeConst83 ) );
				let nodeConst86 = ( nodeVar31 < 0.5 );

				if ( ( nodeConst86 && ( nodeConst84 || nodeConst85 ) ) ) {

					nodeVar29 = -1.0;
					break;


				}


				if ( ( nodeConst86 && ( nodeConst82 || nodeConst83 ) ) ) {

					nodeVar32 = 1.0;


				}


				if ( ( ( nodeConst86 && ( nodeVar32 > 0.5 ) ) && ( ! ( nodeConst82 || nodeConst83 ) ) ) ) {

					nodeVar29 = -1.0;
					break;


				}

				nodeVar17.x = ( nodeVar17.x + nodeConst9.x );
				nodeVar17.y = ( nodeVar17.y + nodeConst9.y );
				nodeVar26.x = ( nodeVar26.x + nodeConst16.x );
				nodeVar26.y = ( nodeVar26.y + nodeConst16.y );


			}


			if ( nodeConst60 ) {

				nodeVar17.x = ( nodeVar17.x + nodeConst9.x );
				nodeVar26.x = ( nodeVar26.x + nodeConst16.x );


			}


			if ( nodeConst61 ) {

				nodeVar17.y = ( nodeVar17.y + nodeConst9.y );
				nodeVar26.y = ( nodeVar26.y + nodeConst16.y );


			}


		}



	}

	nodeVar99 = vec4<f32>( nodeVar27, nodeVar29 );
	nodeVar1 = nodeVar99.xyz;

	if ( ( ( nodeVar99.w < -0.5 ) || ( nodeVar99.w > 1.5 ) ) ) {

		nodeVar100 = 0.0;

	} else {

		nodeVar100 = 1.0;

	}

	nodeVar2 = nodeVar100;

	if ( ( ( nodeVar99.w > 0.5 ) && ( nodeVar99.w < 1.5 ) ) ) {

		nodeVar101 = 1.0;

	} else {

		nodeVar101 = 0.0;

	}

	nodeVar3 = nodeVar101;

	if ( ( ( ( nodeVar2 > 0.5 ) && ( nodeVar3 > 0.5 ) ) && ( 0.0 > 0.5 ) ) ) {

		nodeVar1 = vec3<f32>( 0.0, 0.0, 0.0 );
		nodeVar2 = 0.0;


	}

	nodeVar102 = nodeVar1;
	nodeVar103 = nodeVar2;
	nodeVar104 = vec4<f32>( nodeVar102, nodeVar103 );

	// result

	output.color = vec4<f32>( ( floor( ( ( clamp( ( nodeVar104.xyz / vec3<f32>( object.nodeUniform9 ) ), vec3<f32>( 0.0 ), vec3<f32>( 1.0 ) ) * vec3<f32>( object.nodeUniform10 ) ) + vec3<f32>( 0.5 ) ) ) / vec3<f32>( object.nodeUniform10 ) ), ( floor( ( ( clamp( nodeVar104.w, 0.0, 1.0 ) * object.nodeUniform10 ) + 0.5 ) ) / object.nodeUniform10 ) );

	return output;

}
